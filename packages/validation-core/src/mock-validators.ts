import type { ValidationIssue } from '@ai-engineering-agent/shared-types';
import { createValidationIssue, createValidationReport, mergeValidationChecks } from './report';
import type {
  ValidationCheckContext,
  ValidationCheckResult,
  ValidationPluginDefinition,
  ValidationSuiteResult,
} from './types';

const validationPluginDefinitions: Record<string, ValidationPluginDefinition> = {
  'loading-rule-checker': {
    name: 'loading-rule-checker',
    category: 'rule',
    defaultSeverity: 'medium',
  },
  'debounce-rule-checker': {
    name: 'debounce-rule-checker',
    category: 'rule',
    defaultSeverity: 'medium',
  },
  'delete-confirm-rule-checker': {
    name: 'delete-confirm-rule-checker',
    category: 'rule',
    defaultSeverity: 'high',
  },
  'pagination-table-rule-checker': {
    name: 'pagination-table-rule-checker',
    category: 'rule',
    defaultSeverity: 'medium',
  },
  'playwright-runner': {
    name: 'playwright-runner',
    category: 'e2e',
    defaultSeverity: 'high',
  },
  'visual-regression-runner': {
    name: 'visual-regression-runner',
    category: 'visual',
    defaultSeverity: 'high',
  },
  typecheck: {
    name: 'typecheck',
    category: 'typecheck',
    defaultSeverity: 'critical',
  },
};

export function getValidationPluginDefinition(pluginName: string): ValidationPluginDefinition {
  return validationPluginDefinitions[pluginName] ?? {
    name: pluginName,
    category: 'review',
    defaultSeverity: 'medium',
  };
}

export function runMockValidationPlugin(
  pluginName: string,
  context: ValidationCheckContext,
): ValidationCheckResult {
  const definition = getValidationPluginDefinition(pluginName);
  const issues = buildMockIssues(definition, context);

  return {
    name: pluginName,
    report: createValidationReport(issues),
    metadata: {
      category: definition.category,
      targetProfileId: context.targetProfileId ?? 'unknown',
      targetProject: context.targetProject ?? 'unknown',
      mock: true,
    },
  };
}

export function runMockValidationSuite(
  pluginNames: string[],
  context: ValidationCheckContext,
): ValidationSuiteResult {
  const checks = pluginNames.map((pluginName) => runMockValidationPlugin(pluginName, context));
  return mergeValidationChecks(checks);
}

function buildMockIssues(
  definition: ValidationPluginDefinition,
  context: ValidationCheckContext,
): ValidationIssue[] {
  if (definition.name === 'playwright-runner' && context.targetProfileId === 'wechat-miniapp') {
    return [
      createValidationIssue({
        category: 'e2e',
        severity: 'medium',
        message: '当前 target profile 不支持 Playwright 冒烟执行',
        suggestion: '对小程序改用平台原生自动化或将该校验节点标记为跳过',
      }),
    ];
  }

  return [];
}
