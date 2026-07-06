import type { JsonObject, JsonValue, SchemaRef, TargetProfileRef } from '@ai-engineering-agent/shared-types';
import type { FilePolicyRegistry, TargetProfileDefinition } from '@ai-engineering-agent/policy-engine';
import type { FileSchemaRegistry } from '@ai-engineering-agent/contract-schema';

export type WorkflowNodeType = 'agent' | 'plugin' | 'pluginGroup';

export interface WorkflowFieldDef {
  name: string;
  type: string;
  required?: boolean;
}

export interface WorkflowInputDef {
  schema?: string;
  fields?: WorkflowFieldDef[];
}

export interface WorkflowWhenClause {
  allPassed?: boolean;
  hasFailures?: boolean;
}

export interface WorkflowNodeDef {
  id: string;
  type: WorkflowNodeType;
  skill?: string;
  plugin?: string;
  plugins?: string[];
  dependsOn?: string[];
  outputSchema?: string;
  when?: WorkflowWhenClause;
  /** 节点名称 (用于 UI 展示) */
  name?: string;
  /** 当此节点失败时，回退到的目标节点 ID (修复回流) */
  retryTarget?: string;
  /** 最大重试次数 (默认 3) */
  maxRetries?: number;
  /** 审批闸门 — 节点完成后需要人工审批 */
  requiresApproval?: boolean;
}

export interface WorkflowOutputDef {
  primaryFrom: string;
}

export interface WorkflowRetryPolicy {
  maxRounds: number;
}

export interface WorkflowStageDef {
  name: string;
  nodes: string[];
}

export interface WorkflowApprovalGate {
  afterStage: string;
  name: string;
  required: boolean;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  input?: WorkflowInputDef;
  nodes?: WorkflowNodeDef[];
  stages?: WorkflowStageDef[];
  output?: WorkflowOutputDef;
  retryPolicy?: WorkflowRetryPolicy;
  approvalGates?: WorkflowApprovalGate[];
}

export interface WorkflowNodeResult {
  ok: boolean;
  // skipped 表示节点因条件不满足而被跳过，不算执行失败。
  skipped?: boolean;
  reason?: string;
  error?: string;
  output?: JsonObject;
  raw?: JsonValue;
}

export interface WorkflowRunContext {
  runId: string;
  workflow: WorkflowDefinition;
  targetProject?: string;
  targetProfile?: TargetProfileRef;
  input: JsonObject;
  schemas?: FileSchemaRegistry;
  policies?: FilePolicyRegistry;
  resolvedTargetProfile?: TargetProfileDefinition;
}

export interface WorkflowRunState {
  context: WorkflowRunContext;
  nodeResults: Record<string, WorkflowNodeResult>;
  status: 'pending' | 'running' | 'waiting-approval' | 'failed' | 'completed';
}

export interface WorkflowRegistryEntry {
  filePath: string;
  definition: WorkflowDefinition;
}

export interface SchemaRegistry {
  get(ref: SchemaRef): Promise<JsonObject | undefined>;
}
