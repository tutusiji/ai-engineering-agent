import type { ValidationIssue, ValidationReport } from '@ai-engineering-agent/shared-types';
import { createValidationReport } from '@ai-engineering-agent/validation-core';
import type { ProjectScanReport } from '@ai-engineering-agent/project-scanner';

export function runRuleChecker(pluginName: string, report: ProjectScanReport): ValidationReport {
  switch (pluginName) {
    case 'loading-rule-checker':
      return checkLoadingRule(report);
    case 'debounce-rule-checker':
      return checkDebounceRule(report);
    case 'delete-confirm-rule-checker':
      return checkDeleteConfirmRule(report);
    default:
      return createValidationReport([]);
  }
}

export function checkLoadingRule(report: ProjectScanReport): ValidationReport {
  const issues: ValidationIssue[] = [];
  if (report.pageFiles.length > 0 && report.evidence.loading.length === 0) {
    issues.push({
      category: 'rule',
      severity: 'medium',
      message: '扫描到页面文件，但未发现明显的 loading / pending / skeleton 反馈证据',
      suggestion: '为列表加载、提交按钮和异步区块补充 loading 状态与反馈组件',
    });
  }
  return createValidationReport(issues);
}

export function checkDebounceRule(report: ProjectScanReport): ValidationReport {
  const issues: ValidationIssue[] = [];
  const hasSearchSurface = report.pageFiles.some((file: string) => /search|filter|query|list/i.test(file));
  if (hasSearchSurface && report.evidence.debounce.length === 0) {
    issues.push({
      category: 'rule',
      severity: 'medium',
      message: '存在检索类页面线索，但未发现 debounce / useDebounce / 延迟触发相关实现',
      suggestion: '对搜索输入、联想查询和筛选联动补充 debounce 或取消前序请求能力',
    });
  }
  return createValidationReport(issues);
}

export function checkDeleteConfirmRule(report: ProjectScanReport): ValidationReport {
  const issues: ValidationIssue[] = [];
  const deleteCandidates = report.files.filter((file: string) => /delete|remove|batch/i.test(file));
  const hasDeleteEvidence = report.evidence.deleteConfirm.length > 0;
  if (deleteCandidates.length > 0 && !hasDeleteEvidence) {
    issues.push({
      category: 'rule',
      severity: 'high',
      message: '发现疑似删除/移除相关代码入口，但未发现 confirm / popconfirm / modal.confirm 证据',
      suggestion: '为危险操作增加二次确认，并在文案中展示实体名称或关键信息',
    });
  }
  return createValidationReport(issues);
}
