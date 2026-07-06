/**
 * plugin-runner — 统一的 plugin/pluginGroup 节点执行逻辑
 *
 * 从 llm-runner.ts 抽取，供 CLI runner 和 API workflows.ts 共享。
 * 确保前后端使用同一套 plugin 调用契约，避免双轨制断裂。
 *
 * 支持的 plugin:
 * - project-scanner: 扫描目标项目结构
 * - navigation-decider: 根据页面规划生成 UI 契约
 * - page-generator: 根据实现计划生成代码报告
 * - playwright-runner: E2E 测试验证
 * - visual-regression-runner: 视觉回归验证
 * - rule-checkers (pluginGroup): loading/debounce/delete-confirm 规则检查
 * - 其他未识别的 plugin: 回退到 mock validation
 */

import type { JsonObject, JsonValue, ValidationReport } from '@ai-engineering-agent/shared-types';
import { scanProject } from '@ai-engineering-agent/project-scanner';
import { runRuleChecker } from '@ai-engineering-agent/rule-checkers';
import { buildUiContract } from '@ai-engineering-agent/navigation-decider';
import { buildGenerationReport } from '@ai-engineering-agent/page-generator';
import { buildPlaywrightValidation } from '@ai-engineering-agent/playwright-runner';
import { buildVisualRegressionValidation } from '@ai-engineering-agent/visual-regression-runner';
import { runMockValidationPlugin, runMockValidationSuite } from '@ai-engineering-agent/validation-core';
import type { WorkflowNodeDef, WorkflowNodeResult, WorkflowRunState } from './types.js';

/** 构建验证上下文（供 mock validation plugin 使用） */
function createValidationContext(node: WorkflowNodeDef, state: WorkflowRunState) {
  return {
    runId: state.context.runId,
    nodeId: node.id,
    targetProject: state.context.targetProject,
    targetProfileId: state.context.targetProfile?.id,
    workspaceRoot: state.context.targetProject,
    env: process.env,
  };
}

/** 安全序列化为 JsonValue（处理 undefined/function 等非 JSON 值） */
function toJsonValue<T>(value: T): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

/** 支持的规则检查 plugin 集合 */
const SUPPORTED_RULE_PLUGINS = new Set([
  'loading-rule-checker',
  'debounce-rule-checker',
  'delete-confirm-rule-checker',
]);

/**
 * 执行 plugin/pluginGroup 节点，返回结构化结果。
 *
 * 这是唯一的 plugin 执行入口，CLI runner 和 API 共用此实现。
 */
export async function runPluginNode(
  node: WorkflowNodeDef,
  state: WorkflowRunState,
): Promise<WorkflowNodeResult> {
  // ── pluginGroup: 批量执行规则检查 ────────────────────────
  if (node.type === 'pluginGroup' && node.plugins?.length) {
    return runPluginGroupNode(node, state);
  }

  // ── 单个 plugin ──────────────────────────────────────────
  if (node.type === 'plugin' && node.plugin) {
    return runSinglePluginNode(node, state);
  }

  // 兜底：返回 mock 结果
  return createMockResult(node, state, state.context.input);
}

/** 执行 pluginGroup 节点（批量规则检查） */
async function runPluginGroupNode(
  node: WorkflowNodeDef,
  state: WorkflowRunState,
): Promise<WorkflowNodeResult> {
  const targetProject = state.context.targetProject;
  const scanReport = targetProject ? await scanProject({ rootDir: targetProject }) : undefined;

  const checks = await Promise.all(
    node.plugins!.map(async (pluginName) => {
      // 规则检查器（基于项目扫描）
      if (scanReport && SUPPORTED_RULE_PLUGINS.has(pluginName)) {
        const report = runRuleChecker(pluginName, scanReport);
        return { name: pluginName, report, metadata: { mock: false, source: 'project-scan' } };
      }

      // Playwright E2E
      if (pluginName === 'playwright-runner') {
        const report = await buildPlaywrightValidation({
          targetProfileId: state.context.targetProfile?.id ?? 'unknown',
          targetProject: state.context.targetProject,
          projectScan: scanReport,
          targetValidation: state.context.resolvedTargetProfile?.validation,
        });
        return {
          name: pluginName,
          report: report as unknown as ValidationReport,
          metadata: { mock: false, source: 'playwright-runner' },
        };
      }

      // 视觉回归
      if (pluginName === 'visual-regression-runner') {
        const generationReport = state.nodeResults.code_generation?.output as JsonObject | undefined;
        const report = await buildVisualRegressionValidation({
          targetProfileId: state.context.targetProfile?.id ?? 'unknown',
          targetProject: state.context.targetProject,
          projectScan: scanReport,
          generationReport,
          targetValidation: state.context.resolvedTargetProfile?.validation,
        });
        return {
          name: pluginName,
          report: report as unknown as ValidationReport,
          metadata: { mock: false, source: 'visual-regression-runner' },
        };
      }

      // 未识别的 plugin: 回退到 mock
      return runMockValidationPlugin(pluginName, createValidationContext(node, state));
    }),
  );

  const suiteResult = runMockValidationSuite([], createValidationContext(node, state));
  suiteResult.checks = checks;
  suiteResult.report = {
    passed: checks.every((check) => check.report.passed),
    issues: checks.flatMap((check) => check.report.issues),
  };
  suiteResult.passed = suiteResult.report.passed;

  return {
    ok: suiteResult.passed,
    output: {
      checks: suiteResult.checks.map((check) => ({
        name: check.name,
        passed: check.report.passed,
        issueCount: check.report.issues.length,
      })),
      passed: suiteResult.report.passed,
      issues: toJsonValue(suiteResult.report.issues),
      scannedProject: scanReport?.rootDir ?? null,
    },
    raw: toJsonValue(suiteResult.report),
  };
}

/** 执行单个 plugin 节点 */
async function runSinglePluginNode(
  node: WorkflowNodeDef,
  state: WorkflowRunState,
): Promise<WorkflowNodeResult> {
  const plugin = node.plugin!;

  // 项目扫描
  if (plugin === 'project-scanner' && state.context.targetProject) {
    const scanReport = await scanProject({ rootDir: state.context.targetProject });
    return { ok: true, output: toJsonValue(scanReport) as JsonObject };
  }

  // 导航决策 — 正确的单参数对象调用（修复 workflows.ts 的两参数 bug）
  if (plugin === 'navigation-decider') {
    const targetProfile = state.context.resolvedTargetProfile;
    const pagePlan = state.nodeResults.page_planning?.output as JsonObject | undefined;
    const scanReport = state.context.targetProject
      ? await scanProject({ rootDir: state.context.targetProject })
      : undefined;
    const uiContract = buildUiContract({
      targetProfileId: targetProfile?.id ?? 'unknown',
      supportedLayouts: Array.isArray(targetProfile?.pagePatterns?.supports)
        ? (targetProfile?.pagePatterns?.supports as string[])
        : [],
      pagePlan: {
        targetProfile: String(pagePlan?.targetProfile ?? targetProfile?.id ?? 'unknown'),
        pages: Array.isArray(pagePlan?.pages) ? (pagePlan.pages as never[]) : [],
      },
      projectScan: scanReport,
    });
    return { ok: true, output: uiContract };
  }

  // 页面生成
  if (plugin === 'page-generator') {
    const implementationPlan = state.nodeResults.implementation_plan?.output as JsonObject | undefined;
    const uiContract = state.nodeResults.navigation_decision?.output as JsonObject | undefined;
    const generationReport = buildGenerationReport({
      implementationPlan: {
        pageName: String(implementationPlan?.pageName ?? '示例页面'),
        targetProfile: String(implementationPlan?.targetProfile ?? 'unknown'),
        files: Array.isArray(implementationPlan?.files) ? (implementationPlan.files as never[]) : [],
        routeChanges: Array.isArray(implementationPlan?.routeChanges)
          ? (implementationPlan.routeChanges as string[])
          : undefined,
        componentDependencies: Array.isArray(implementationPlan?.componentDependencies)
          ? (implementationPlan.componentDependencies as string[])
          : undefined,
      },
      uiContract,
    });
    return { ok: true, output: generationReport };
  }

  // Playwright E2E
  if (plugin === 'playwright-runner') {
    const scanReport = state.context.targetProject
      ? await scanProject({ rootDir: state.context.targetProject })
      : undefined;
    const report = await buildPlaywrightValidation({
      targetProfileId: state.context.targetProfile?.id ?? 'unknown',
      targetProject: state.context.targetProject,
      projectScan: scanReport,
      targetValidation: state.context.resolvedTargetProfile?.validation,
    });
    const runnerStatus = typeof report.runnerStatus === 'string' ? report.runnerStatus : 'unknown';
    return { ok: !['failed'].includes(runnerStatus), output: report, raw: toJsonValue(report) };
  }

  // 视觉回归
  if (plugin === 'visual-regression-runner') {
    const scanReport = state.context.targetProject
      ? await scanProject({ rootDir: state.context.targetProject })
      : undefined;
    const generationReport = state.nodeResults.code_generation?.output as JsonObject | undefined;
    const report = await buildVisualRegressionValidation({
      targetProfileId: state.context.targetProfile?.id ?? 'unknown',
      targetProject: state.context.targetProject,
      projectScan: scanReport,
      generationReport,
      targetValidation: state.context.resolvedTargetProfile?.validation,
    });
    const runnerStatus = typeof report.runnerStatus === 'string' ? report.runnerStatus : 'unknown';
    return { ok: !['failed'].includes(runnerStatus), output: report, raw: toJsonValue(report) };
  }

  // 兜底：mock validation
  const check = runMockValidationPlugin(plugin, createValidationContext(node, state));
  return {
    ok: check.report.passed,
    output: { check: check.name, passed: check.report.passed, issues: toJsonValue(check.report.issues) },
    raw: toJsonValue(check.report),
  };
}

/** 生成 mock 结果（用于未识别的节点或 target_profile_selection） */
export function createMockResult(
  node: WorkflowNodeDef,
  state: WorkflowRunState,
  input: JsonObject,
): WorkflowNodeResult {
  const handledBy = node.skill ?? node.plugin ?? node.plugins ?? 'mock-runner';

  if (node.id === 'target_profile_selection') {
    const targetProfile = state.context.resolvedTargetProfile;
    return {
      ok: true,
      output: {
        profileId: targetProfile?.id ?? 'unknown',
        platform: targetProfile?.platform ?? 'unknown',
        framework: targetProfile?.framework ?? 'unknown',
        uiLibrary: targetProfile?.uiLibrary ?? 'unknown',
        routingMode: targetProfile?.routingMode ?? 'unknown',
        reasons: ['mock runner selected configured target profile'],
      },
    };
  }

  return {
    ok: true,
    output: {
      nodeId: node.id,
      nodeType: node.type,
      handledBy,
      targetProfile: state.context.targetProfile?.id ?? 'unknown',
      availableInputKeys: Object.keys(input),
      schemaHint: node.outputSchema ?? null,
    },
  };
}
