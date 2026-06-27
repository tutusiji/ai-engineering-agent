/**
 * workflows — 工作流列表与执行路由
 */

import { Router } from 'express';
import path from 'node:path';
import type { LlmConfig } from '@ai-engineering-agent/agent-runtime';
import { SessionStore, RunStore, ArtifactStore } from '@ai-engineering-agent/persistence';
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import { WorkflowExecutor, loadWorkflowRegistry } from '@ai-engineering-agent/workflow-core';
import { getSkill, runSkillThroughLlm } from '@ai-engineering-agent/agent-runtime';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { validateParams, validateBody } from '../middleware/validate-request.js';
import { WorkflowRunSchema, SessionIdParamSchema } from '../lib/validate.js';
import { createSkillContext, generateId } from '../lib/skill-context.js';
import { repoRoot } from '../lib/config.js';
import type { WorkflowNodeResult } from '@ai-engineering-agent/workflow-core';

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
              const dynamicProfileId = (input.profileId as string) ?? state.context.targetProfile?.id ?? profileId;
              const archDesign = (input.techStack || input.projectName) ? input as JsonObject : undefined;
              const ctx = createSkillContext(dynamicProfileId, archDesign);
              const result = await runSkillThroughLlm(skill, ctx, input, llmConfig);
              if (result.ok) {
                await runStore.updateStage(runId, node.id, { status: 'completed', completedAt: Date.now(), result: result.output });
              } else {
                await runStore.updateStage(runId, node.id, { status: 'failed', completedAt: Date.now(), error: result.error });
              }
              return { ok: result.ok, output: result.output as JsonObject ?? undefined, error: result.error };
            },
            runPlugin: async (node, input, state) => {
              await runStore.updateStage(runId, node.id, { status: 'running', startedAt: Date.now() });
              let result: WorkflowNodeResult;
              try {
                switch (node.id) {
                  case 'project-scanner': {
                    const scanner = await import('../../../plugins/project-scanner/src/index.js');
                    result = { ok: true, output: scanner.scanProject(state.context.targetProject ?? '.') as unknown as JsonObject };
                    break;
                  }
                  case 'navigation-decider': {
                    const nav = await import('../../../plugins/navigation-decider/src/index.js');
                    result = { ok: true, output: nav.buildUiContract(input, state.context.resolvedTargetProfile) as unknown as JsonObject };
                    break;
                  }
                  case 'page-generator': {
                    const pg = await import('../../../plugins/page-generator/src/index.js');
                    result = { ok: true, output: pg.buildGenerationReport(input) as unknown as JsonObject };
                    break;
                  }
                  case 'playwright-runner': {
                    const pw = await import('../../../plugins/playwright-runner/src/index.js');
                    result = { ok: true, output: pw.buildPlaywrightValidation(state.context.targetProject ?? '.') as unknown as JsonObject };
                    break;
                  }
                  case 'visual-regression-runner': {
                    const vr = await import('../../../plugins/visual-regression-runner/src/index.js');
                    result = { ok: true, output: vr.buildVisualRegressionValidation(state.context.targetProject ?? '.') as unknown as JsonObject };
                    break;
                  }
                  case 'db-migration': {
                    const { generateMigration } = await import('../../../plugins/db-migration/src/index.js');
                    const dataModel = state.nodeResults['data_modeling']?.output;
                    const entities = (dataModel as Record<string, unknown>)?.entities as Array<Record<string, unknown>> | undefined;
                    result = { ok: true, output: generateMigration({
                      entities: entities ?? [],
                      recommendedDb: String((dataModel as Record<string, unknown>)?.recommendedDb ?? 'postgresql'),
                    }) as unknown as JsonObject };
                    break;
                  }
                  case 'api-scaffold': {
                    const { scaffoldApi } = await import('../../../plugins/api-scaffold/src/index.js');
                    const resolvedProfile = state.context.resolvedTargetProfile as unknown as Record<string, unknown> | undefined;
                    const backendRaw = resolvedProfile?.backend as Record<string, unknown> | undefined;
                    result = { ok: true, output: scaffoldApi({
                      targetDir: state.context.targetProject ?? './generated',
                      apiContract: (state.nodeResults['api_design']?.output ?? {}) as JsonObject,
                      backendProfile: {
                        framework: String(backendRaw?.framework ?? 'nestjs'),
                        language: String(backendRaw?.language ?? 'typescript'),
                      },
                    }) as unknown as JsonObject };
                    break;
                  }
                  case 'docker-generator': {
                    const { generateDocker } = await import('../../../plugins/docker-generator/src/index.js');
                    result = { ok: true, output: generateDocker({
                      appName: 'generated-app',
                      backendPort: 3000,
                      frontendPort: 80,
                      dbType: 'postgresql',
                      services: ['nginx', 'api', 'db'],
                    }) as unknown as JsonObject };
                    break;
                  }
                  case 'api-contract-validator': {
                    const { validateApiContract } = await import('../../../plugins/api-contract-validator/src/index.js');
                    const apiContract = (state.nodeResults['api_design']?.output ?? {}) as JsonObject;
                    const backendOutput = state.nodeResults['backend_coding']?.output as Record<string, unknown> | undefined;
                    const generatedFiles = (backendOutput?.generatedFiles as Array<{path: string; content: string}>) ?? [];
                    result = { ok: true, output: validateApiContract({ apiContract, generatedFiles }) as unknown as JsonObject };
                    break;
                  }
                  default:
                    result = { ok: true, output: { message: `Plugin ${node.id} executed (stub)` } };
                }
              } catch (err) {
                result = { ok: false, error: String(err) };
              }
              if (result.ok) {
                await runStore.updateStage(runId, node.id, { status: 'completed', completedAt: Date.now(), result: result.output });
              } else {
                await runStore.updateStage(runId, node.id, { status: 'failed', completedAt: Date.now(), error: result.error });
              }
              return result;
            },
            runPluginGroup: async (node) => {
              await runStore.updateStage(runId, node.id, { status: 'running', startedAt: Date.now() });
              const result = { ok: true, output: { message: `Plugin group ${node.id} executed` } };
              await runStore.updateStage(runId, node.id, { status: 'completed', completedAt: Date.now(), result: result.output });
              return result;
            },
          });

          const input: JsonObject = { ...(params as JsonObject), sessionId, profileId };
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
