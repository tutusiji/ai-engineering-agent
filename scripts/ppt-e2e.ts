#!/usr/bin/env tsx
/**
 * ppt-e2e — PPT 功能端到端验证（不入 CI，对齐 spec §12「真实产物验收」）
 *
 * 用法: pnpm tsx scripts/ppt-e2e.ts
 *       需要跑第 2/3 步（真实 LLM）时与 pnpm migrate 同模式先 source .env：
 *       bash -c 'set -a; [ -f .env ] && source .env; set +a; pnpm tsx scripts/ppt-e2e.ts'
 *
 * 三步验证（executor 直连，不经前端与路由层）：
 * 1) 纯产物验证：内置最小 PptContent + 商务深蓝主题直接调 buildPptx → 落盘 sample.pptx，
 *    用 JSZip 解包断言 [Content_Types].xml 与 ppt/slides/slide1.xml 存在
 * 2) 大纲工作流：WorkflowExecutor 执行 workflows/ppt-outline.yaml
 *    （source=paste 素材直传，不依赖 DB），断言 outline_planning 节点输出
 *    含 deckTitle 且 slides.length > 0
 * 3) 构建工作流：WorkflowExecutor 执行 workflows/ppt-build.yaml（大纲取第 2 步输出），
 *    断言 pptx_build 节点 ok 且 ArtifactStore 中存在 <runId>/deck.pptx、sizeBytes > 0
 *
 * 无 LLM key 时第 2/3 步打印 SKIP（脚本 exit 0 —— SKIP 是合法终态）。
 * 三步均不依赖数据库：paste 素材直传、pptx-builder 的 saveBinary 落纯文件 ArtifactStore。
 */

import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import {
  getSkill,
  loadLlmConfigFromEnv,
  runSkillThroughLlm,
  type LlmConfig,
} from '@ai-engineering-agent/agent-runtime';
import { ArtifactStore } from '@ai-engineering-agent/persistence';
import { FileSchemaRegistry } from '@ai-engineering-agent/contract-schema';
import { FilePolicyRegistry } from '@ai-engineering-agent/policy-engine';
import {
  WorkflowExecutor,
  loadWorkflowFile,
  runPluginNode,
  type WorkflowNodeDef,
  type WorkflowNodeResult,
  type WorkflowRunState,
} from '@ai-engineering-agent/workflow-core';
import type { SkillContext } from '@ai-engineering-agent/skill-sdk';
import { buildPptx, type PptContent, type PptTheme } from '@ai-engineering-agent/pptx-core';

// ── 路径基准：脚本位于 <repoRoot>/scripts/，仓库根为其上一级 ──
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

/** 商务深蓝主题 — 与迁移种子 002_ppt_templates.sql 中 theme-business-blue 逐字一致 */
const BIZ_BLUE_THEME = {
  name: '商务深蓝',
  mode: 'preset',
  colors: {
    primary: '1D4ED8',
    secondary: '3B82F6',
    background: 'FFFFFF',
    surface: 'EFF6FF',
    text: '0F172A',
    accent: 'F59E0B',
  },
  fonts: { title: 'Microsoft YaHei', body: 'Microsoft YaHei' },
  slideSize: '16:9',
  layoutDensity: 'standard',
} satisfies PptTheme;

/** 步骤 1 的最小渲染内容 — 覆盖 cover/toc/content-bullets/ending 四种版式，字数均在预算内 */
const SAMPLE_CONTENT: PptContent = {
  deckTitle: '星辰 CRM 项目周报（第 32 周）',
  subtitle: '面向部门联席周会的进展汇报',
  audience: '部门联席周会',
  slides: [
    {
      pageNo: 1,
      pageType: 'cover',
      title: '星辰 CRM 项目周报（第 32 周）',
      polishedTitle: '星辰 CRM 项目周报（第 32 周）',
    },
    {
      pageNo: 2,
      pageType: 'toc',
      title: '部分联调完成模块清单',
      polishedTitle: '联调完成模块',
      polishedBullets: ['客户管理模块联调完成', '订单中心契约评审通过', '数据看板接入真实数据'],
    },
    {
      pageNo: 3,
      pageType: 'content-bullets',
      title: '关键数据',
      polishedTitle: '关键数据',
      hookLine: '转化率提升 1.8pp',
      polishedBullets: ['新增客户 1,284 家，环比 +12%', '订单转化率 23.6%，环比 +1.8pp', '线上缺陷 9 个已修复 7 个'],
      notes: '先讲结论：增长与质量都在轨道上。',
    },
    {
      pageNo: 4,
      pageType: 'ending',
      title: '谢谢',
      polishedTitle: '谢谢，欢迎提问',
    },
  ],
};

/** 步骤 2 的粘贴素材 — 假想项目周报 Markdown（约 300 字，高于采集器 100 字下限） */
const SAMPLE_MARKDOWN = `# 星辰 CRM 项目周报（第 32 周）

## 本周进展
- 客户管理模块完成联调，列表搜索 300ms debounce 与空态、加载态均通过验收
- 订单中心 API 契约评审通过，2 个字段映射问题已闭环
- 数据看板接入真实数据源，首屏加载时间从 4.2 秒降至 1.6 秒

## 关键数据
- 本周新增客户 1,284 家，环比增长 12%
- 订单转化率 23.6%，较上周提升 1.8 个百分点
- 线上缺陷共 9 个，其中 P1 级 1 个，已修复 7 个

## 风险与求助
- 第三方支付回调存在约 500ms 抖动，需要运维协助排查网关日志
- UI 走查发现 14 处样式偏差，前端人力紧张，申请 1 名工程师支援

## 下周计划
- 完成支付对账模块的开发与联调
- 启动客户分层运营功能的架构设计评审
`;

/**
 * 断言工具 — 条件不成立时抛出带中文说明的错误，由各步骤 try/catch 捕获标红。
 * 注意：断言后不依赖参数收窄，需要收窄的场景用 if-throw 显式判断。
 * @param condition 断言条件
 * @param message 断言失败时的中文说明
 */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * 无 key 探测 — 直接复用 loadLlmConfigFromEnv：抛错即视为未配置 LLM key。
 * 不自行枚举环境变量名，避免与 studio-api 的 key 优先级逻辑漂移。
 * @returns LLM 配置；未配置任何 key 时返回 undefined
 */
function tryLoadLlmConfig(): LlmConfig | undefined {
  try {
    return loadLlmConfigFromEnv();
  } catch {
    return undefined;
  }
}

/**
 * 构造 e2e 专用 SkillContext — 形状对齐 apps/studio-api/src/lib/skill-context.ts 的 createSkillContext，
 * 区别仅在于 runId/nodeId 取自当前 executor 状态（便于日志对账）。
 * PPT skill 的 buildPrompt 不消费 ctx，但保持与生产一致的注册表注入。
 * @param runId 本次工作流执行的 run id（executor 生成的 <workflowId>-<ts>）
 * @param nodeId 当前执行的节点 id
 * @returns Skill 运行时上下文
 */
function createE2eSkillContext(runId: string, nodeId: string): SkillContext {
  return {
    runId,
    nodeId,
    // FileSchemaRegistry / FilePolicyRegistry 与 SkillContext 契约同构，与 studio-api 同样收窄注入
    schemas: schemas as unknown as SkillContext['schemas'],
    policies: policies as unknown as SkillContext['policies'],
    artifacts: [],
    logger: {
      info: (msg: string) => console.log(`[INFO] ${msg}`),
      warn: (msg: string) => console.warn(`[WARN] ${msg}`),
      error: (msg: string) => console.error(`[ERROR] ${msg}`),
    },
  };
}

// 合约与策略注册表 — 构造方式对齐 apps/studio-api/src/lib/skill-context.ts:10-15
const schemas = new FileSchemaRegistry({ contractsDir: path.join(repoRoot, 'contracts') });
const policies = new FilePolicyRegistry({
  policiesDir: path.join(repoRoot, 'policies'),
  targetPoliciesDir: path.join(repoRoot, 'policies/targets'),
});

/**
 * 组装 WorkflowExecutor — 适配器对齐 apps/studio-api/src/routes/workflows.ts:132-183，
 * 仅剥离路由层专属的 runStore.updateStage/update 记录（e2e 不经路由层，回调保持最小）。
 * @param llmConfig 已探明的 LLM 配置
 * @returns 可执行的 WorkflowExecutor
 */
function createE2eExecutor(llmConfig: LlmConfig): WorkflowExecutor {
  return new WorkflowExecutor({
    // agent 节点：getSkill → 构造 SkillContext → runSkillThroughLlm（与生产 runAgent 同链路）
    runAgent: async (
      node: WorkflowNodeDef,
      input: JsonObject,
      state: WorkflowRunState
    ): Promise<WorkflowNodeResult> => {
      const skillName = node.skill;
      if (!skillName) return { ok: false, error: `Agent 节点 ${node.id} 未定义 skill` };
      const skill = getSkill(skillName);
      if (!skill) return { ok: false, error: `Skill 不存在: ${skillName}` };
      // workflows.ts 的 buildSkillInput 对 PPT skill 走 default 分支（原样透传），此处省略
      const ctx = createE2eSkillContext(state.context.runId, node.id);
      const result = await runSkillThroughLlm(skill, ctx, input, llmConfig);
      return { ok: result.ok, output: result.output, error: result.error };
    },
    // plugin/pluginGroup 节点：直接复用 plugin-runner 的统一入口（与生产 runPlugin/runPluginGroup 同实现）
    runPlugin: async (
      node: WorkflowNodeDef,
      _input: JsonObject,
      state: WorkflowRunState
    ): Promise<WorkflowNodeResult> => runPluginNode(node, state),
    runPluginGroup: async (
      node: WorkflowNodeDef,
      _input: JsonObject,
      state: WorkflowRunState
    ): Promise<WorkflowNodeResult> => runPluginNode(node, state),
  });
}

/**
 * 汇总工作流中失败节点的错误信息 — 用于工作流整体失败时给出可定位的诊断
 * @param state executor 返回的运行状态
 * @returns 「节点id: 错误信息」串接文本；无失败节点时返回占位说明
 */
function collectNodeErrors(state: WorkflowRunState): string {
  const errors = Object.entries(state.nodeResults)
    .filter(([, nodeResult]) => nodeResult.ok === false)
    .map(([nodeId, nodeResult]) => `${nodeId}: ${nodeResult.error ?? '(无错误信息)'}`);
  return errors.length > 0 ? errors.join('; ') : '(无失败节点记录)';
}

/**
 * 步骤 1 — 纯产物验证：buildPptx 直接生成 sample.pptx 并用 JSZip 解包断言 OOXML 骨架
 * @returns 步骤结果说明（用于汇总打印）
 */
async function step1BuildSample(): Promise<string> {
  // 商务深蓝主题 + 最小内容直接调渲染层（不经工作流）
  const buffer = await buildPptx(SAMPLE_CONTENT, BIZ_BLUE_THEME);
  const outPath = path.join(repoRoot, 'sample.pptx');
  writeFileSync(outPath, buffer);

  // JSZip 解包断言
  const zip = await JSZip.loadAsync(buffer);
  assert(zip.file('[Content_Types].xml') !== null, 'sample.pptx 缺少 [Content_Types].xml');
  assert(zip.file('ppt/slides/slide1.xml') !== null, 'sample.pptx 缺少 ppt/slides/slide1.xml');
  return `sample.pptx 落盘 ${outPath}（${buffer.length} 字节，${SAMPLE_CONTENT.slides.length} 页）`;
}

/**
 * 步骤 2 — 大纲工作流：ppt-outline（素材归一化 → LLM 大纲规划）
 * @param llmConfig LLM 配置
 * @returns 大纲节点输出（供步骤 3 作为构建输入）
 */
async function step2Outline(llmConfig: LlmConfig): Promise<JsonObject> {
  const { definition } = await loadWorkflowFile(path.join(repoRoot, 'workflows', 'ppt-outline.yaml'));
  const executor = createE2eExecutor(llmConfig);
  // 初始输入对齐工作流合约：source（paste 直传）/ theme（完整 ppt-theme JSON）/ preferences
  const input: JsonObject = {
    source: { sourceType: 'paste', text: SAMPLE_MARKDOWN },
    theme: BIZ_BLUE_THEME,
    preferences: { targetPages: 8, audience: '部门联席周会' },
  };
  const result = await executor.execute(definition, input, { schemas, policies });
  assert(
    result.status === 'completed',
    `ppt-outline 工作流未完成，实际状态: ${result.status}，失败节点: ${collectNodeErrors(result)}`
  );

  const outlineNode = result.nodeResults['outline_planning'];
  assert(outlineNode?.ok === true, `outline_planning 节点未通过: ${outlineNode?.error ?? '(无错误信息)'}`);
  const outline = outlineNode.output ?? {};

  // deckTitle 与 slides 断言 — 需要窄化判断，用 if-throw 显式书写
  const deckTitle = outline['deckTitle'];
  if (typeof deckTitle !== 'string' || deckTitle === '') {
    throw new Error('大纲输出缺少 deckTitle');
  }
  const slides = outline['slides'];
  if (!Array.isArray(slides) || slides.length === 0) {
    throw new Error('大纲输出 slides 为空');
  }
  console.log(`   大纲标题: ${deckTitle}，共 ${slides.length} 页`);
  return outline;
}

/**
 * 步骤 3 — 构建工作流：ppt-build（LLM 文字美化 → pptx-builder 构建 + artifact 发布）
 * @param llmConfig LLM 配置
 * @param outline 步骤 2 产出的大纲 JSON
 * @returns 步骤结果说明（用于汇总打印）
 */
async function step3Build(llmConfig: LlmConfig, outline: JsonObject): Promise<string> {
  const { definition } = await loadWorkflowFile(path.join(repoRoot, 'workflows', 'ppt-build.yaml'));
  const executor = createE2eExecutor(llmConfig);
  // 大纲来自第 2 步结果（生产中等价于审批后回传），theme 走顶层输入供 pptx-builder 读取
  const input: JsonObject = { outline, theme: BIZ_BLUE_THEME };
  const result = await executor.execute(definition, input, { schemas, policies });
  assert(
    result.status === 'completed',
    `ppt-build 工作流未完成，实际状态: ${result.status}，失败节点: ${collectNodeErrors(result)}`
  );

  const buildNode = result.nodeResults['pptx_build'];
  assert(buildNode?.ok === true, `pptx_build 节点未通过: ${buildNode?.error ?? '(无错误信息)'}`);

  // runId 以 executor.execute 返回结构中的实际字段为准（<workflowId>-<ts>）；
  // plugin-runner 内部 new ArtifactStore()（默认 ~/.ai-studio/data/artifacts），此处以同默认目录断言落盘
  const runId = result.context.runId;
  const artifactStore = new ArtifactStore();
  const deck = artifactStore.readBinary(runId, 'deck.pptx');
  if (!deck || deck.length === 0) {
    throw new Error(`ArtifactStore 中不存在 <${runId}>/deck.pptx 或文件为空`);
  }

  // fitting 告警（如有）随 validation 透传，打印供人工核对
  const issues = buildNode.validation?.issues ?? [];
  for (const issue of issues) console.log(`   ⚠️ fitting 告警: ${issue.message}`);
  return `runId=${runId}，deck.pptx ${deck.length} 字节已落 ArtifactStore（经现有 runs artifacts 路由可下载）`;
}

/** 步骤执行器统一入口 — 逐项跑步骤并汇总 PASS/SKIP/FAIL，任何步骤失败时 exit 1 */
async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   PPT 功能端到端验证 (ppt-e2e)           ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  const llmConfig = tryLoadLlmConfig();
  if (!llmConfig) {
    console.log('⏭️  未检测到 LLM key，第 2/3 步将 SKIP（配置 .env 后重跑可全量验证）');
    console.log('');
  }

  let failed = 0;

  // ── 步骤 1：纯产物验证（不依赖 LLM）──
  try {
    const detail = await step1BuildSample();
    console.log('✅ 步骤 1 纯产物验证（buildPptx + JSZip 解包）');
    console.log(`   ${detail}`);
  } catch (err) {
    failed++;
    console.log('❌ 步骤 1 纯产物验证（buildPptx + JSZip 解包）');
    console.log(`   ${err instanceof Error ? err.message : String(err)}`);
  }
  console.log('');

  // ── 步骤 2 + 3：依赖 LLM，无 key 时整体 SKIP；步骤 2 失败则不再跑步骤 3 ──
  if (!llmConfig) {
    console.log('⏭️  步骤 2 大纲工作流（ppt-outline）— SKIP（未配置 LLM key）');
    console.log('⏭️  步骤 3 构建工作流（ppt-build）— SKIP（未配置 LLM key）');
    console.log('');
  } else {
    let outline: JsonObject | undefined;
    try {
      outline = await step2Outline(llmConfig);
      console.log('✅ 步骤 2 大纲工作流（ppt-outline）');
      console.log('   大纲输出结构合法（deckTitle + 非空 slides）');
    } catch (err) {
      failed++;
      console.log('❌ 步骤 2 大纲工作流（ppt-outline）');
      console.log(`   ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log('');

    if (outline === undefined) {
      // 步骤 2 未产出大纲时步骤 3 无输入，跳过并提示（失败计数已由步骤 2 承担）
      console.log('⏭️  步骤 3 构建工作流（ppt-build）— SKIP（步骤 2 未产出大纲）');
      console.log('');
    } else {
      try {
        const detail = await step3Build(llmConfig, outline);
        console.log('✅ 步骤 3 构建工作流（ppt-build）');
        console.log(`   ${detail}`);
      } catch (err) {
        failed++;
        console.log('❌ 步骤 3 构建工作流（ppt-build）');
        console.log(`   ${err instanceof Error ? err.message : String(err)}`);
      }
      console.log('');
    }
  }

  if (failed > 0) {
    console.log(`❌ 端到端验证失败：${failed} 个步骤未通过`);
    // 置退出码后自然返回，避免 stdout 缓冲区未刷新即退出导致结尾日志丢失
    process.exitCode = 1;
    return;
  }
  console.log('✅ 端到端验证通过（SKIP 不计入失败）');
}

main().catch((err: unknown) => {
  console.error('\n❌ 端到端验证脚本异常退出:', err instanceof Error ? err.message : String(err));
  // 置退出码后让事件循环自然排空退出，避免 stdout/stderr 缓冲区未刷新即退出导致结尾日志丢失
  process.exitCode = 1;
});
