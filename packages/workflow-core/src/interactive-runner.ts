/**
 * Interactive Requirement CLI — 多轮对话式需求收集
 *
 * Usage:
 *   pnpm requirement
 *   pnpm requirement --profile vue3-admin
 *
 * Flow:
 *   1. AI 主动开场提问
 *   2. 用户输入回答
 *   3. AI 追问 + 更新需求文档
 *   4. 重复直到 completeness >= 80%
 *   5. 展示需求文档，询问是否生成前端预览页或直接编码
 */

import * as readline from 'node:readline';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import { FileSchemaRegistry } from '@ai-engineering-agent/contract-schema';
import { FilePolicyRegistry } from '@ai-engineering-agent/policy-engine';
import {
  getSkill,
  runSkillThroughLlm,
  loadLlmConfigFromEnv,
  type LlmConfig,
} from '@ai-engineering-agent/agent-runtime';
import type { SkillContext, SkillDefinition } from '@ai-engineering-agent/skill-sdk';
import type { RequirementDocument } from '@ai-engineering-agent/agent-runtime';

import { getCompatibleLibraries, getLibrarySummary } from '@ai-engineering-agent/agent-runtime';

// ─── Config ─────────────────────────────────────────────────────────────

let llmConfig: LlmConfig;
try {
  llmConfig = loadLlmConfigFromEnv();
} catch (error) {
  console.error('❌ LLM 配置加载失败，请设置环境变量');
  process.exit(1);
}

// ─── State ──────────────────────────────────────────────────────────────

interface ConversationState {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  document: RequirementDocument | null;
  profileId: string;
  phase: 'gather' | 'refine' | 'score' | 'design' | 'code';
}

// ─── Helpers ────────────────────────────────────────────────────────────

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise(resolve => rl.question(prompt, resolve));
}

function createSkillContext(profileId: string, policies: FilePolicyRegistry, schemas: FileSchemaRegistry): SkillContext {
  return {
    runId: `interactive-${Date.now()}`,
    nodeId: 'interactive-requirement',
    targetProfile: { id: profileId, platform: 'admin-web', framework: 'vue3' },
    schemas: schemas as unknown as SkillContext['schemas'],
    policies: policies as unknown as SkillContext['policies'],
    artifacts: [],
    logger: {
      info: (msg) => console.log(`  ℹ️  ${msg}`),
      warn: (msg) => console.warn(`  ⚠️  ${msg}`),
      error: (msg) => console.error(`  ❌ ${msg}`),
    },
  };
}

function printSeparator() {
  console.log('\n' + '─'.repeat(60) + '\n');
}

function printCompleteness(doc: RequirementDocument) {
  const bar = generateProgressBar(doc.completeness);
  console.log(`\n📊 需求完整度: ${bar} ${doc.completeness}%`);

  if (doc.completeness >= 95) {
    console.log('   ✨ 需求已非常完整，可以开始编码！');
  } else if (doc.completeness >= 80) {
    console.log('   ✅ 需求已足够完整，可以生成前端预览页');
  } else if (doc.completeness >= 50) {
    console.log('   🔄 需求进行中，继续完善');
  } else {
    console.log('   📝 需求刚开始，继续收集信息');
  }
}

function generateProgressBar(percent: number): string {
  const width = 20;
  const filled = Math.round((percent / 100) * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

function printDocumentSummary(doc: RequirementDocument) {
  console.log('📋 需求文档摘要:');
  console.log(`   功能: ${doc.featureName}`);
  console.log(`   目标: ${doc.businessGoal}`);
  console.log(`   角色: ${doc.userRoles.map(r => r.name).join(', ') || '未定义'}`);
  if (doc.uiLibrary) {
    console.log(`   UI 库: ${doc.uiLibrary.name} (${doc.uiLibrary.npmPackage})`);
  } else {
    console.log('   UI 库: ⚠️ 未选择');
  }
  console.log(`   页面: ${doc.pages.map(p => p.name).join(', ') || '未定义'}`);
  console.log(`   实体: ${doc.entities.map(e => e.name).join(', ') || '未定义'}`);
  console.log(`   规则: ${doc.businessRules.length} 条`);
  console.log(`   边界: ${doc.edgeCases.length} 条`);

  if (doc.phases.length > 0) {
    console.log('   阶段:');
    for (const phase of doc.phases) {
      console.log(`     ${phase.id}: ${phase.name} (${phase.priority}) — ${phase.pages.join(', ')}`);
    }
  }
}

function printOpenQuestions(doc: RequirementDocument) {
  if (doc.openQuestions.length > 0) {
    console.log('\n❓ 待确认问题:');
    doc.openQuestions.forEach((q, i) => {
      console.log(`   ${i + 1}. ${q}`);
    });
  }
}

async function saveDocument(doc: RequirementDocument, outputDir: string) {
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, 'requirement-document.json');
  await fs.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf-8');
  console.log(`\n💾 需求文档已保存: ${filePath}`);
  return filePath;
}

async function saveDesignHtml(html: string, outputDir: string) {
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, 'frontend-preview.html');
  await fs.writeFile(filePath, html, 'utf-8');
  console.log(`\n🧩 前端预览页已保存: ${filePath}`);
  return filePath;
}

async function saveCodeFiles(files: Array<{ path: string; content: string }>, projectRoot: string) {
  let count = 0;
  for (const file of files) {
    const fullPath = path.join(projectRoot, file.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.content, 'utf-8');
    count++;
    console.log(`   📄 ${file.path}`);
  }
  console.log(`\n✅ 已生成 ${count} 个代码文件`);
}

// ─── Core Loop ──────────────────────────────────────────────────────────

async function runGatherPhase(
  skill: SkillDefinition,
  ctx: SkillContext,
  state: ConversationState,
  rl: readline.Interface,
): Promise<void> {
  const isFirst = state.messages.length === 0;
  const mode = isFirst ? 'gather' : 'refine';

  if (isFirst) {
    console.log('\n🤖 AI: 你好！我是你的前端需求分析助手。请告诉我你想要做什么功能？');
    console.log('    （描述越详细越好，我会根据你的描述逐步完善需求）\n');
  }

  const userMessage = await ask(rl, '👤 你: ');

  if (userMessage.trim().toLowerCase() === '/quit' || userMessage.trim().toLowerCase() === '/exit') {
    console.log('\n👋 再见！');
    process.exit(0);
  }

  if (userMessage.trim().toLowerCase() === '/score') {
    state.phase = 'score';
    return;
  }

  if (userMessage.trim().toLowerCase() === '/design') {
    state.phase = 'design';
    return;
  }

  if (userMessage.trim().toLowerCase() === '/code') {
    state.phase = 'code';
    return;
  }

  if (userMessage.trim().toLowerCase() === '/ui') {
    const framework = state.document
      ? String((state.document as unknown as Record<string, unknown>).uiLibrary
          ? 'vue3'
          : 'vue3')
      : 'vue3';
    const libs = getCompatibleLibraries(framework);
    console.log(`\n📦 可用的 UI 组件库 (${framework}):`);
    for (const lib of libs) {
      console.log(getLibrarySummary(lib));
    }
    console.log('\n在对话中告诉 AI 你想用哪个库，例如: "用 Ant Design Vue" 或 "UI 库选 Naive UI"');
    return;
  }

  if (userMessage.trim().toLowerCase() === '/doc') {
    if (state.document) {
      printDocumentSummary(state.document);
      printCompleteness(state.document);
    } else {
      console.log('还没有需求文档，请先描述你的需求');
    }
    return;
  }

  // Add to history
  state.messages.push({ role: 'user', content: userMessage });

  // Build input
  const input: JsonObject = {
    userMessage,
    conversationHistory: state.messages as JsonObject[],
    existingDocument: (state.document as unknown as JsonObject) ?? null,
    mode,
  };

  // Call LLM
  console.log('\n🤖 AI 思考中...');
  const result = await runSkillThroughLlm(skill, ctx, input, llmConfig);

  if (!result.ok || !result.output) {
    console.log(`\n❌ AI 响应失败: ${result.error}`);
    state.messages.pop(); // Remove failed message
    return;
  }

  // Parse result
  const doc = result.output as unknown as RequirementDocument;
  state.document = doc;
  state.messages.push({ role: 'assistant', content: JSON.stringify(doc) });

  // Display
  printSeparator();
  printDocumentSummary(doc);
  printCompleteness(doc);
  printOpenQuestions(doc);

  // Auto-phase transition
  if (doc.completeness >= 80 && state.phase === 'gather') {
    console.log('\n💡 需求完整度已达到 80%，可以:');
    console.log('   /design — 生成前端预览页');
    console.log('   /code   — 直接开始编码');
    console.log('   /score  — 详细评分报告');
    console.log('   继续输入 — 继续完善需求');
  }
}

async function runScorePhase(
  skill: SkillDefinition,
  ctx: SkillContext,
  state: ConversationState,
): Promise<void> {
  if (!state.document) {
    console.log('还没有需求文档，请先描述你的需求');
    state.phase = 'gather';
    return;
  }

  console.log('\n📊 正在评估需求完整度...');

  const input: JsonObject = {
    userMessage: '请对当前需求文档进行完整度评分',
    conversationHistory: state.messages,
    existingDocument: state.document as unknown as JsonObject,
    mode: 'score',
  };

  const result = await runSkillThroughLlm(skill, ctx, input, llmConfig);
  if (result.ok && result.output) {
    const doc = result.output as unknown as RequirementDocument;
    state.document = doc;
    printSeparator();
    printDocumentSummary(doc);
    printCompleteness(doc);
    printOpenQuestions(doc);
  }

  state.phase = 'gather';
}

async function runDesignPhase(
  skill: SkillDefinition,
  ctx: SkillContext,
  state: ConversationState,
): Promise<void> {
  if (!state.document) {
    console.log('还没有需求文档，请先描述你的需求');
    state.phase = 'gather';
    return;
  }

  const designSkill = getSkill('design-generation');
  if (!designSkill) {
    console.log('❌ design-generation skill 未注册');
    state.phase = 'gather';
    return;
  }

  console.log('\n🧩 正在生成前端预览页...');

  const input: JsonObject = {
    ...(state.document as unknown as JsonObject),
    phaseId: 'P1',
    pages: state.document.phases[0]?.pages ?? state.document.pages.map(p => p.name),
  };

  const result = await runSkillThroughLlm(designSkill, ctx, input, llmConfig);
  if (result.ok && result.output) {
    const files = result.output.generatedFiles as Array<{ path: string; content: string; kind: string }>;
    const htmlFile = files.find(f => f.path.endsWith('.html'));

    if (htmlFile?.content) {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const repoRoot = path.resolve(currentDir, '../../..');
      const outputPath = await saveDesignHtml(htmlFile.content, path.join(repoRoot, 'artifacts'));
      console.log(`\n🌐 在浏览器中打开: file://${outputPath}`);
    }
  }

  state.phase = 'gather';
}

async function runCodePhase(
  skill: SkillDefinition,
  ctx: SkillContext,
  state: ConversationState,
): Promise<void> {
  if (!state.document) {
    console.log('还没有需求文档，请先描述你的需求');
    state.phase = 'gather';
    return;
  }

  const codeSkill = getSkill('code-generation');
  if (!codeSkill) {
    console.log('❌ code-generation skill 未注册');
    state.phase = 'gather';
    return;
  }

  const phaseId = state.document.phases[0]?.id ?? 'P1';
  const phasePages = state.document.phases[0]?.pages ?? state.document.pages.map(p => p.name);

  console.log(`\n🚀 正在为阶段 ${phaseId} 生成代码...`);
  console.log(`   页面: ${phasePages.join(', ')}`);

  const input: JsonObject = {
    ...(state.document as unknown as JsonObject),
    phaseId,
    pages: phasePages,
  };

  const result = await runSkillThroughLlm(codeSkill, ctx, input, llmConfig);
  if (result.ok && result.output) {
    const files = result.output.generatedFiles as Array<{ path: string; content: string }>;
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(currentDir, '../../..');
    const projectDir = path.join(repoRoot, 'output', state.document.featureName);

    await saveCodeFiles(
      files.map(f => ({ path: f.path, content: f.content })),
      projectDir,
    );

    // Also save the requirement document
    await saveDocument(state.document, path.join(projectDir, 'artifacts'));
  }

  state.phase = 'gather';
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter(a => a !== '--');
  let profileId = 'vue3-admin';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile' && args[i + 1]) {
      profileId = args[i + 1];
    }
  }

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(currentDir, '../../..');
  const contractsDir = path.join(repoRoot, 'contracts');
  const policiesDir = path.join(repoRoot, 'policies');
  const targetPoliciesDir = path.join(policiesDir, 'targets');

  const schemas = new FileSchemaRegistry({ contractsDir });
  const policies = new FilePolicyRegistry({ policiesDir, targetPoliciesDir });
  const ctx = createSkillContext(profileId, policies, schemas);

  const skill = getSkill('interactive-requirement');
  if (!skill) {
    console.error('❌ interactive-requirement skill 未注册');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   AI Engineering Agent                           ║');
  console.log('║   交互式需求对话                                  ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`🤖 LLM: ${llmConfig.model}`);
  console.log(`🎯 Profile: ${profileId}`);
  console.log('');
  console.log('命令:');
  console.log('  /doc    — 查看当前需求文档');
  console.log('  /ui     — 查看可用 UI 组件库');
  console.log('  /score  — 评估需求完整度');
  console.log('  /design — 生成前端预览页 (需完整度 >= 80%)');
  console.log('  /code   — 生成代码 (需完整度 >= 95%)');
  console.log('  /quit   — 退出');
  console.log('');

  const state: ConversationState = {
    messages: [],
    document: null,
    profileId,
    phase: 'gather',
  };

  const rl = createReadline();

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      switch (state.phase) {
        case 'gather':
        case 'refine':
          await runGatherPhase(skill, ctx, state, rl);
          break;
        case 'score':
          await runScorePhase(skill, ctx, state);
          break;
        case 'design':
          await runDesignPhase(skill, ctx, state);
          break;
        case 'code':
          await runCodePhase(skill, ctx, state);
          break;
      }
    }
  } finally {
    rl.close();
  }
}

void main().catch((error) => {
  console.error('\n❌ 致命错误:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
