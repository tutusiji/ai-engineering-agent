/**
 * LLM Runner — workflow entry point with real LLM-powered agent nodes.
 *
 * Usage:
 *   pnpm workflow:llm [workflowId] [targetProfile] [targetProject]
 *
 * Example:
 *   pnpm workflow:llm from-chat-to-page vue3-admin ~/my-vue3-project
 *
 * Environment variables (loaded from ~/.hermes/.env or shell):
 *   XIAOMI_API_KEY / XIAOMI_BASE_URL   — Xiaomi MiMo
 *   OPENROUTER_API_KEY                  — OpenRouter
 *   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL — generic override
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JsonObject, JsonValue } from '@ai-engineering-agent/shared-types';
import { FileSchemaRegistry } from '@ai-engineering-agent/contract-schema';
import { FilePolicyRegistry } from '@ai-engineering-agent/policy-engine';
import { WorkflowExecutor } from './executor';
import { loadWorkflowRegistry } from './loader';
import { runPluginNode, createMockResult } from './plugin-runner.js';
import type { WorkflowNodeDef, WorkflowNodeResult, WorkflowRunState } from './types';

// Agent Runtime
import {
  getSkill,
  runSkillThroughLlm,
  loadLlmConfigFromEnv,
  type LlmConfig,
} from '@ai-engineering-agent/agent-runtime';
import type { SkillContext } from '@ai-engineering-agent/skill-sdk';

// ─── LLM Config ────────────────────────────────────────────────────────

let llmConfig: LlmConfig;

try {
  llmConfig = loadLlmConfigFromEnv();
} catch (error) {
  console.error('❌ LLM 配置加载失败:');
  console.error(`   ${error instanceof Error ? error.message : String(error)}`);
  console.error('');
  console.error('请设置以下环境变量之一:');
  console.error('  - LLM_BASE_URL + LLM_API_KEY + LLM_MODEL');
  console.error('  - XIAOMI_API_KEY (+ XIAOMI_BASE_URL)');
  console.error('  - OPENROUTER_API_KEY');
  process.exit(1);
}

// ─── Agent Node Runner ──────────────────────────────────────────────────

async function runAgentNode(
  node: WorkflowNodeDef,
  input: JsonObject,
  state: WorkflowRunState,
): Promise<WorkflowNodeResult> {
  const skillName = node.skill;
  if (!skillName) {
    return { ok: false, error: `Agent node ${node.id} has no skill defined` };
  }

  const skill = getSkill(skillName);
  if (!skill) {
    console.log(`  ⚠️  Skill "${skillName}" not found, falling back to mock`);
    return createMockResult(node, state, input);
  }

  console.log(`  🤖 Running skill: ${skillName} via ${llmConfig.model}`);

  const ctx: SkillContext = {
    runId: state.context.runId,
    nodeId: node.id,
    targetProject: state.context.targetProject,
    targetProfile: state.context.targetProfile,
    schemas: state.context.schemas as unknown as SkillContext['schemas'],
    policies: state.context.policies as unknown as SkillContext['policies'],
    artifacts: [],
    logger: {
      info: (msg, extra) => console.log(`    ℹ️  ${msg}`, extra ?? ''),
      warn: (msg, extra) => console.warn(`    ⚠️  ${msg}`, extra ?? ''),
      error: (msg, extra) => console.error(`    ❌ ${msg}`, extra ?? ''),
    },
  };

  const result = await runSkillThroughLlm(skill, ctx, input, llmConfig);

  if (result.ok && result.output) {
    console.log(`  ✅ Skill "${skillName}" completed (model: ${result.model ?? 'unknown'})`);
    if (result.usage) {
      console.log(`     tokens: ${result.usage.prompt_tokens} in + ${result.usage.completion_tokens} out = ${result.usage.total_tokens} total`);
    }
    return { ok: true, output: result.output, raw: result.raw as JsonValue };
  }

  console.log(`  ❌ Skill "${skillName}" failed: ${result.error}`);
  return { ok: false, error: result.error, raw: result.raw as JsonValue };
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(currentDir, '../../..');
  const workflowDir = path.join(repoRoot, 'workflows');
  const contractsDir = path.join(repoRoot, 'contracts');
  const policiesDir = path.join(repoRoot, 'policies');
  const targetPoliciesDir = path.join(policiesDir, 'targets');

  const cliArgs = process.argv.slice(2).filter((arg) => arg !== '--');
  const requestedWorkflowId = cliArgs[0] ?? 'from-chat-to-page';
  const requestedTargetProfile = cliArgs[1] ?? 'vue3-admin';
  const requestedTargetProject = cliArgs[2] ? path.resolve(cliArgs[2]) : repoRoot;
  const userPrompt = cliArgs[3] ?? '生成一个用户管理页面，包含用户列表、新增用户、编辑用户和删除用户功能';

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   AI Engineering Agent — LLM Runner              ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📋 Workflow:   ${requestedWorkflowId}`);
  console.log(`🎯 Profile:    ${requestedTargetProfile}`);
  console.log(`📁 Project:    ${requestedTargetProject}`);
  console.log(`🤖 LLM Model:  ${llmConfig.model}`);
  console.log(`🌐 LLM URL:    ${llmConfig.baseUrl}`);
  console.log('');

  // Load workflow registry
  const registry = await loadWorkflowRegistry(workflowDir);
  const entry = registry[requestedWorkflowId];
  if (!entry) {
    throw new Error(`未找到工作流: ${requestedWorkflowId}`);
  }
  if (!entry.definition.nodes?.length) {
    throw new Error(`工作流 ${requestedWorkflowId} 当前没有可直接执行的 nodes`);
  }

  // Load schemas and policies
  const schemas = new FileSchemaRegistry({ contractsDir });
  const policies = new FilePolicyRegistry({ policiesDir, targetPoliciesDir });
  const targetProfile = await policies.getTargetProfile(requestedTargetProfile);
  if (!targetProfile) {
    throw new Error(`未找到目标 profile: ${requestedTargetProfile}`);
  }

  // Build executor with real LLM agent runner
  const executor = new WorkflowExecutor({
    async runAgent(node, input, state) {
      return runAgentNode(node, input, state);
    },
    async runPlugin(node, _input, state) {
      return runPluginNode(node, state);
    },
    async runPluginGroup(node, _input, state) {
      return runPluginNode(node, state);
    },
  });

  // Execute
  console.log('━━━ 开始执行工作流 ━━━');
  console.log('');

  const input: JsonObject = {
    userPrompt,
    targetProject: requestedTargetProject,
  };

  const result = await executor.execute(entry.definition, input, {
    targetProject: input.targetProject as string,
    targetProfile: {
      id: targetProfile.id ?? requestedTargetProfile,
      platform: targetProfile.platform,
      framework: targetProfile.framework,
    },
    schemas,
    policies,
    resolvedTargetProfile: targetProfile,
  });

  // Print results
  console.log('');
  console.log('━━━ 执行结果 ━━━');
  console.log('');
  printRunState(result);

  // Print agent outputs
  console.log('');
  console.log('━━━ Agent 产出详情 ━━━');
  for (const [nodeId, nodeResult] of Object.entries(result.nodeResults)) {
    if (nodeResult.skipped) continue;
    console.log(`\n▸ ${nodeId}:`);
    if (nodeResult.output) {
      console.log(JSON.stringify(nodeResult.output, null, 2));
    }
    if (nodeResult.error) {
      console.log(`  error: ${nodeResult.error}`);
    }
  }
}

function printRunState(state: WorkflowRunState): void {
  const statusIcon = state.status === 'completed' ? '✅' : state.status === 'failed' ? '❌' : '⏳';
  console.log(`${statusIcon} 运行状态: ${state.status}`);
  console.log(`   运行 ID:  ${state.context.runId}`);
  console.log('   节点结果:');

  for (const [nodeId, result] of Object.entries(state.nodeResults)) {
    const icon = result.skipped ? '⏭️' : result.ok ? '✅' : '❌';
    const suffix = result.skipped ? ' [skipped]' : '';
    console.log(`   ${icon} ${nodeId}${suffix}`);
  }
}

void main().catch((error) => {
  console.error('');
  console.error('❌ 致命错误:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
