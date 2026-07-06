import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JsonObject, JsonValue, ValidationReport } from '@ai-engineering-agent/shared-types';
import { FileSchemaRegistry } from '@ai-engineering-agent/contract-schema';
import { FilePolicyRegistry } from '@ai-engineering-agent/policy-engine';
import { WorkflowExecutor } from './executor';
import { loadWorkflowRegistry } from './loader';
import type { WorkflowNodeDef, WorkflowNodeResult, WorkflowRunState } from './types';
import {
  runMockValidationPlugin,
  runMockValidationSuite,
} from '@ai-engineering-agent/validation-core';
import { scanProject } from '@ai-engineering-agent/project-scanner';
import { runRuleChecker } from '@ai-engineering-agent/rule-checkers';
import { buildUiContract } from '@ai-engineering-agent/navigation-decider';
import { buildGenerationReport } from '@ai-engineering-agent/page-generator';
import { buildPlaywrightValidation } from '@ai-engineering-agent/playwright-runner';
import { buildVisualRegressionValidation } from '@ai-engineering-agent/visual-regression-runner';

function createMockResult(node: WorkflowNodeDef, state: WorkflowRunState, input: JsonObject): WorkflowNodeResult {
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

  if (node.id === 'page_planning') {
    const targetProfile = state.context.resolvedTargetProfile;
    return {
      ok: true,
      output: {
        targetProfile: targetProfile?.id ?? 'unknown',
        pages: [
          {
            name: '示例列表页',
            pageType: 'list',
            routeMode: targetProfile?.id === 'wechat-miniapp' ? 'miniapp-page' : 'menu-route',
            reusedComponents: ['search-panel', 'table-pagination'],
            dangerActions: ['delete'],
          },
        ],
      },
    };
  }

  if (node.id === 'implementation_plan') {
    const targetProfile = state.context.resolvedTargetProfile;
    const pagePlan = state.nodeResults.page_planning?.output as JsonObject | undefined;
    const pageName = Array.isArray(pagePlan?.pages)
      ? String((pagePlan.pages[0] as { name?: string } | undefined)?.name ?? '示例页面')
      : '示例页面';
    return {
      ok: true,
      output: {
        pageName,
        targetProfile: targetProfile?.id ?? 'unknown',
        files: buildImplementationFiles(targetProfile?.framework as string | undefined, pageName),
        routeChanges: [buildRouteChangeHint(targetProfile?.framework as string | undefined, pageName)],
        componentDependencies: ['search-panel', 'table-pagination'],
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

function toJsonValue<T>(value: T): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function buildImplementationFiles(framework: string | undefined, pageName: string) {
  const slug = toKebabCase(pageName);
  if (framework === 'react') {
    return [
      { path: `src/pages/${slug}/index.tsx`, kind: 'page' },
      { path: `src/pages/${slug}/hooks/use-${slug}-page.ts`, kind: 'hook' },
      { path: `src/pages/${slug}/service.ts`, kind: 'api' },
      { path: `src/pages/${slug}/index.test.tsx`, kind: 'test' },
    ];
  }

  if (framework === 'native-miniapp') {
    return [
      { path: `miniprogram/pages/${slug}/index.ts`, kind: 'page' },
      { path: `miniprogram/pages/${slug}/index.wxml`, kind: 'view' },
      { path: `miniprogram/pages/${slug}/index.wxss`, kind: 'style' },
      { path: `miniprogram/pages/${slug}/index.test.ts`, kind: 'test' },
    ];
  }

  return [
    { path: `src/views/${slug}/index.vue`, kind: 'page' },
    { path: `src/views/${slug}/use-${slug}-page.ts`, kind: 'composable' },
    { path: `src/api/${slug}.ts`, kind: 'api' },
    { path: `src/views/${slug}/index.test.ts`, kind: 'test' },
  ];
}

function buildRouteChangeHint(framework: string | undefined, pageName: string): string {
  const slug = toKebabCase(pageName);
  if (framework === 'react') {
    return `在 react-router 配置中注册 /${slug} 页面路由`;
  }
  if (framework === 'native-miniapp') {
    return `在 app.json 中注册 pages/${slug}/index 页面入口`;
  }
  return `在 vue-router 菜单路由中注册 /${slug} 页面`;
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-\u4e00-\u9fa5]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

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

async function createValidationNodeResult(node: WorkflowNodeDef, state: WorkflowRunState): Promise<WorkflowNodeResult> {
  if (node.type === 'pluginGroup' && node.plugins?.length) {
    const targetProject = state.context.targetProject;
    const scanReport = targetProject ? await scanProject({ rootDir: targetProject }) : undefined;

    const supportedRulePlugins = new Set([
      'loading-rule-checker',
      'debounce-rule-checker',
      'delete-confirm-rule-checker',
    ]);

    const checks = await Promise.all(
      node.plugins.map(async (pluginName) => {
        if (scanReport && supportedRulePlugins.has(pluginName)) {
          const report = runRuleChecker(pluginName, scanReport);
          return {
            name: pluginName,
            report,
            metadata: {
              mock: false,
              source: 'project-scan',
            },
          };
        }

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
            metadata: {
              mock: false,
              source: 'playwright-runner',
            },
          };
        }

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
            metadata: {
              mock: false,
              source: 'visual-regression-runner',
            },
          };
        }

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

  if (node.type === 'plugin' && node.plugin) {
    if (node.plugin === 'project-scanner' && state.context.targetProject) {
      const scanReport = await scanProject({ rootDir: state.context.targetProject });
      return {
        ok: true,
        output: toJsonValue(scanReport) as JsonObject,
      };
    }

    if (node.plugin === 'navigation-decider') {
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
      return {
        ok: true,
        output: uiContract,
      };
    }

    if (node.plugin === 'page-generator') {
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
      return {
        ok: true,
        output: generationReport,
      };
    }

    if (node.plugin === 'playwright-runner') {
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
      const blockingStatuses = new Set(['failed']);
      return {
        ok: !blockingStatuses.has(runnerStatus),
        output: report,
        raw: toJsonValue(report),
      };
    }

    if (node.plugin === 'visual-regression-runner') {
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
      const blockingStatuses = new Set(['failed']);
      return {
        ok: !blockingStatuses.has(runnerStatus),
        output: report,
        raw: toJsonValue(report),
      };
    }

    const check = runMockValidationPlugin(node.plugin, createValidationContext(node, state));
    return {
      ok: check.report.passed,
      output: {
        check: check.name,
        passed: check.report.passed,
        issues: toJsonValue(check.report.issues),
      },
      raw: toJsonValue(check.report),
    };
  }

  return createMockResult(node, state, state.context.input);
}

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

  const registry = await loadWorkflowRegistry(workflowDir);
  const entry = registry[requestedWorkflowId];
  if (!entry) {
    throw new Error(`未找到工作流: ${requestedWorkflowId}`);
  }
  if (!entry.definition.nodes?.length) {
    throw new Error(`工作流 ${requestedWorkflowId} 当前没有可直接执行的 nodes`);
  }

  const schemas = new FileSchemaRegistry({ contractsDir });
  const policies = new FilePolicyRegistry({ policiesDir, targetPoliciesDir });
  const targetProfile = await policies.getTargetProfile(requestedTargetProfile);
  if (!targetProfile) {
    throw new Error(`未找到目标 profile: ${requestedTargetProfile}`);
  }

  const targetProfileSchema = await schemas.get({ name: 'target-profile-selection' });
  const sharedPolicy = await policies.get('shared-frontend-policy');

  const executor = new WorkflowExecutor({
    async runAgent(node, input, state) {
      return createMockResult(node, state, input);
    },
    async runPlugin(node, input, state) {
      const runtimePlugins = new Set(['project-scanner', 'navigation-decider', 'page-generator', 'playwright-runner', 'visual-regression-runner', 'typecheck']);
      if (node.plugin && runtimePlugins.has(node.plugin)) {
        return createValidationNodeResult(node, state);
      }
      return createMockResult(node, state, input);
    },
    async runPluginGroup(node, input, state) {
      return createValidationNodeResult(node, state);
    },
  });

  const input: JsonObject = {
    userPrompt: '生成一个前端页面流程示例',
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

  printRuntimeSummary(targetProfileSchema, sharedPolicy, targetProfile);
  printRunState(result);
}

function printRuntimeSummary(
  targetProfileSchema: JsonObject | undefined,
  sharedPolicy: JsonObject | undefined,
  targetProfile: { id?: string },
): void {
  console.log('运行时上下文:');
  console.log(`- target-profile schema: ${targetProfileSchema ? 'loaded' : 'missing'}`);
  console.log(`- shared policy: ${sharedPolicy ? 'loaded' : 'missing'}`);
  console.log(`- active profile: ${stringifyValue(targetProfile.id)}`);
}

function printRunState(state: WorkflowRunState): void {
  console.log(`运行状态: ${state.status}`);
  console.log(`运行 ID: ${state.context.runId}`);
  console.log('节点结果:');

  for (const [nodeId, result] of Object.entries(state.nodeResults)) {
    const suffix = result.skipped ? ' [skipped]' : '';
    console.log(`- ${nodeId}: ok=${result.ok}${suffix}`);
    if (result.raw && typeof result.raw === 'object' && 'issues' in result.raw) {
      const report = result.raw as unknown as ValidationReport;
      const issueCount = Array.isArray(report.issues) ? report.issues.length : 0;
      console.log(`  issues: ${issueCount}`);
    }
  }
}

function stringifyValue(value: JsonValue | undefined): string {
  if (value === undefined) {
    return 'undefined';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
