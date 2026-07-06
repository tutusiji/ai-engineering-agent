import type { JsonValue, ValidationIssue, ValidationReport } from '@ai-engineering-agent/shared-types';

export interface ValidationCheckContext {
  runId: string;
  nodeId: string;
  targetProject?: string;
  targetProfileId?: string;
  workspaceRoot?: string;
  env?: Record<string, string | undefined>;
}

export interface ValidationCheckResult {
  name: string;
  report: ValidationReport;
  durationMs?: number;
  metadata?: Record<string, JsonValue>;
}

export interface ValidationSuiteResult {
  passed: boolean;
  checks: ValidationCheckResult[];
  report: ValidationReport;
}

export interface ValidationPluginDefinition {
  name: string;
  category: ValidationIssue['category'];
  defaultSeverity?: ValidationIssue['severity'];
}

export interface ApiContractValidationResult {
  passed: boolean;
  totalEndpoints: number;
  matchedEndpoints: number;
  missingEndpoints: string[];
  typeMismatches: Array<{ endpoint: string; field: string; expected: string; actual: string }>;
}

export interface DbMigrationValidationResult {
  passed: boolean;
  migrationCount: number;
  canApply: boolean;
  errors: string[];
}

export interface IntegrationTestResult {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  failures: Array<{ test: string; error: string }>;
}

export interface DeploymentValidationResult {
  passed: boolean;
  services: Array<{ name: string; healthy: boolean; url?: string }>;
}
