import type { ValidationIssue, ValidationReport } from '@ai-engineering-agent/shared-types';
import type { ValidationCheckResult, ValidationSuiteResult } from './types';

export function createValidationReport(issues: ValidationIssue[] = []): ValidationReport {
  return {
    passed: issues.length === 0,
    issues,
  };
}

export function mergeValidationReports(reports: ValidationReport[]): ValidationReport {
  const issues = reports.flatMap((report) => report.issues);
  return createValidationReport(issues);
}

export function mergeValidationChecks(checks: ValidationCheckResult[]): ValidationSuiteResult {
  const report = mergeValidationReports(checks.map((check) => check.report));
  return {
    passed: report.passed,
    checks,
    report,
  };
}

export function createValidationIssue(issue: ValidationIssue): ValidationIssue {
  return issue;
}
