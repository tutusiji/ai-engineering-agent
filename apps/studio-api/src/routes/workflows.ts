/**
 * workflows — 工作流列表与执行路由
 */

import { Router } from 'express';
import path from 'node:path';
import type { LlmConfig } from '@ai-engineering-agent/agent-runtime';
import { SessionStore, RunStore, ArtifactStore } from '@ai-engineering-agent/persistence';
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import { WorkflowExecutor, loadWorkflowRegistry, runPluginNode } from '@ai-engineering-agent/workflow-core';
import { getSkill, runSkillThroughLlm } from '@ai-engineering-agent/agent-runtime';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { validateParams, validateBody } from '../middleware/validate-request.js';
import { WorkflowRunSchema, SessionIdParamSchema } from '../lib/validate.js';
import { createSkillContext, generateId, getActiveArchitecture } from '../lib/skill-context.js';
import { repoRoot } from '../lib/config.js';

function loadWorkflows(): Array<{ id: string; name: string; description: string; stages: string[] }> {
  const workflowsDir = path.join(repoRoot, 'workflows');
  if (!existsSync(workflowsDir)) return [];
  const files = readdirSync(workflowsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  return files.map(file => {
    const content = readFileSync(path.join(workflowsDir, file), 'utf-8');
    const nameMatch = content.match(/name:\s*(.+)/);
    const descMatch = content.match(/description:\s*(.+)/);
    const stageMatches = [...content.matchAll(/- id:\s*(\S+)/g)].map(m => m[1]);
    return {
      id: file.replace(/\.((yaml|yml))$/, ''),
      name: nameMatch?.[1]?.trim() ?? file,
      description: descMatch?.[1]?.trim() ?? '',
      stages: stageMatches,
    };
  });
}

/**
 * 根据 skill 名构造正确的输入对象。
 *
 * 修复断裂点 #2: 不同 skill 需要不同的输入字段，之前统一传 session.document
 * 导致 requirement-analysis 拿不到 userPrompt，architecture-planning 拿不到
 * 正确的 featureName/businessGoal。
 *
 * 策略：
 * - requirement-analysis / interactive-requirement: 需要 userPrompt
 * - architecture-planning: 需要 session document（featureName/pages/entities 等）
 * - 后续 skill（data-modeling/api-design/...）: 依赖前序节点输出，executor 已自动 merge
 * - 所有 skill: 保留 input 中已有的前序节点输出（不覆盖）
 */
function buildSkillInput(
  skillName: string,
  input: JsonObject,
  session: { userPrompt: string; sessionDocument: JsonObject; archDesign?: JsonObject },
): JsonObject {
  const { userPrompt, sessionDocument } = session;

  switch (skillName) {
    // 需求类 skill: 需要 userPrompt
    case 'requirement-analysis':
    case 'interactive-requirement':
      return {
        ...input,
        userPrompt: input.userPrompt ?? userPrompt,
      };

    // 架构类 skill: 需要 session document 的结构化字段
    case 'architecture-planning':
      return {
        ...input,
        featureName: input.featureName ?? sessionDocument.featureName ?? '未命名项目',
        businessGoal: input.businessGoal ?? sessionDocument.businessGoal ?? '',
        pages: input.pages ?? sessionDocument.pages ?? [],
        entities: input.entities ?? sessionDocument.entities ?? [],
      };

    // 后续 skill: 前序节点输出已在 input 中（executor 自动 merge），直接透传
    default:
      return input;
  }
}

export function createWorkflowsRouter(
  llmConfig: LlmConfig,
  sessionStore: SessionStore,
  runStore: RunStore,
  artifactStore: ArtifactStore,
) {
  const router = Router();
  const schemas = (createSkillContext().schemas as unknown as { registry: Map<string, unknown> }) ?? undefined;
  const policies = createSkillContext().policies;

  router.get('/', (_req, res) => {
    res.json(loadWorkflows());
  });

  router.post('/:id/run', validateParams(SessionIdParamSchema), validateBody(WorkflowRunSchema), async (req, res) => {
    try {
      const { profileId, sessionId, params = {} } = req.body;
      const runId = `run-${generateId()}`;
      const workflowId = req.params.id;
      await runStore.create(runId, workflowId, workflowId, 'manual');
      res.json({ ok: true, runId, status: 'pending' });

      (async () => {
        try {
          await runStore.update(runId, { status: 'running' });
          const registry = await loadWorkflowRegistry(path.join(repoRoot, 'workflows'));
          const definition = registry.get(workflowId);
          if (!definition) {
            await runStore.complete(runId, `Workflow not found: ${workflowId}`);
            return;
          }
          if (definition.nodes) {
            for (const node of definition.nodes) {
              await runStore.updateStage(runId, node.id, { name: node.name ?? node.id, nodeType: node.type, status: 'pending' });
            }
          }

          // ── 加载 session 上下文 ────────────────────────────────
          // 工作流需要 session 的 document 和 messages 作为 skill 输入。
          // 这是修复"skill 输入契约不匹配"断裂点的关键：不再传裸 profileId，
          // 而是传完整的会话上下文。
          const session = sessionId ? await sessionStore.get(sessionId) : undefined;
          const sessionDocument = (session?.document ?? {}) as JsonObject;
          const sessionMessages = session?.messages ?? [];
          // 最后一条用户消息作为 userPrompt（requirement-analysis 等需要）
          const lastUserMessage = [...sessionMessages].reverse().find((m) => m.role === 'user');
          const userPrompt = (params as JsonObject)?.userPrompt as string ?? lastUserMessage?.content ?? '';
          // 从 session 提取激活的架构方案（architecture-planning 后续 skill 需要）
          const archDesign = getActiveArchitecture(session);

          const executor = new WorkflowExecutor({
            runAgent: async (node, input, state) => {
              await runStore.updateStage(runId, node.id, { status: 'running', startedAt: Date.now() });
              await runStore.update(runId, { status: 'running' });
              const skillName = node.skill;
              if (!skillName) {
                await runStore.updateStage(runId, node.id, { status: 'failed', error: 'No skill defined' });
                return { ok: false, error: `Agent node ${node.id} has no skill defined` };
              }
              const skill = getSkill(skillName);
              if (!skill) {
                await runStore.updateStage(runId, node.id, { status: 'failed', error: `Skill not found: ${skillName}` });
                return { ok: false, error: `Skill not found: ${skillName}` };
              }

              // ── 根据 skill 类型构造正确的输入 ──────────────────
              // 修复断裂点 #2: skill 输入契约不匹配
              const dynamicProfileId = (input.profileId as string) ?? state.context.targetProfile?.id ?? profileId;
              const skillInput = buildSkillInput(skillName, input, {
                userPrompt,
                sessionDocument,
                archDesign,
              });
              const ctx = createSkillContext(dynamicProfileId, archDesign);
              const result = await runSkillThroughLlm(skill, ctx, skillInput, llmConfig);
              if (result.ok) {
                await runStore.updateStage(runId, node.id, { status: 'completed', completedAt: Date.now(), result: result.output });
              } else {
                await runStore.updateStage(runId, node.id, { status: 'failed', completedAt: Date.now(), error: result.error });
              }
              return { ok: result.ok, output: result.output as JsonObject ?? undefined, error: result.error };
            },
            runPlugin: async (node, _input, state) => {
              await runStore.updateStage(runId, node.id, { status: 'running', startedAt: Date.now() });
              const result = await runPluginNode(node, state);
              if (result.ok) {
                await runStore.updateStage(runId, node.id, { status: 'completed', completedAt: Date.now(), result: result.output });
              } else {
                await runStore.updateStage(runId, node.id, { status: 'failed', completedAt: Date.now(), error: result.error });
              }
              return result;
            },
            runPluginGroup: async (node, _input, state) => {
              await runStore.updateStage(runId, node.id, { status: 'running', startedAt: Date.now() });
              const result = await runPluginNode(node, state);
              if (result.ok) {
                await runStore.updateStage(runId, node.id, { status: 'completed', completedAt: Date.now(), result: result.output });
              } else {
                await runStore.updateStage(runId, node.id, { status: 'failed', completedAt: Date.now(), error: result.error });
              }
              return result;
            },
          });

          // ── 构造初始 input ──────────────────────────────────────
          // 包含 session 上下文，让首个 agent 节点能拿到正确输入。
          const input: JsonObject = {
            ...(params as JsonObject),
            sessionId,
            profileId,
            userPrompt,
            // session document 的字段会被 spread 进来，供需要 document 的 skill 使用
            ...sessionDocument,
          };
          const options = {
            targetProject: (params as JsonObject)?.targetProject as string ?? undefined,
            targetProfile: { id: profileId },
            schemas,
            policies,
            onApprovalRequired: async () => {
              await runStore.update(runId, { status: 'waiting-approval' });
              return true;
            },
            onNodeStart: async () => { await runStore.update(runId, { status: 'running' }); },
            onNodeComplete: async (node, result) => {
              if (result.ok) await runStore.updateStage(runId, node.id, { status: 'completed', completedAt: Date.now() });
            },
          };

          const executionResult = await executor.execute(definition, input, options);
          await runStore.update(runId, { status: executionResult.status === 'completed' ? 'completed' : executionResult.status === 'waiting-approval' ? 'waiting-approval' : 'failed', result: executionResult.nodeResults as unknown as JsonObject });

          const nodeResults = executionResult.nodeResults;
          for (const [, nodeResult] of Object.entries(nodeResults)) {
            if (nodeResult?.ok && nodeResult.output) {
              const output = nodeResult.output as Record<string, unknown>;
              if (Array.isArray(output.generatedFiles)) {
                for (const file of output.generatedFiles as Array<{ path: string; content: string }>) {
                  artifactStore.save(runId, file.path, file.content);
                  await runStore.addArtifact(runId, file.path);
                }
              }
            }
          }
          await runStore.complete(runId);
        } catch (err) {
          await runStore.complete(runId, String(err));
        }
      })();
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
