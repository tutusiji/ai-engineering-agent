import type { JsonObject, TargetProfileRef } from '@ai-engineering-agent/shared-types';
import type {
  WorkflowDefinition,
  WorkflowNodeDef,
  WorkflowNodeResult,
  WorkflowRunState,
} from './types';

export interface WorkflowExecutorAdapters {
  runAgent(node: WorkflowNodeDef, input: JsonObject, state: WorkflowRunState): Promise<WorkflowNodeResult>;
  runPlugin(node: WorkflowNodeDef, input: JsonObject, state: WorkflowRunState): Promise<WorkflowNodeResult>;
  runPluginGroup(node: WorkflowNodeDef, input: JsonObject, state: WorkflowRunState): Promise<WorkflowNodeResult>;
}

export interface WorkflowExecutionOptions {
  targetProject?: string;
  targetProfile?: TargetProfileRef;
  schemas?: WorkflowRunState['context']['schemas'];
  policies?: WorkflowRunState['context']['policies'];
  resolvedTargetProfile?: WorkflowRunState['context']['resolvedTargetProfile'];
  /** 审批回调 — 返回 true 继续，false 中止 */
  onApprovalRequired?: (node: WorkflowNodeDef, state: WorkflowRunState) => Promise<boolean>;
  /** 节点事件回调 */
  onNodeStart?: (node: WorkflowNodeDef, state: WorkflowRunState) => void;
  onNodeComplete?: (node: WorkflowNodeDef, result: WorkflowNodeResult, state: WorkflowRunState) => void;
  /** 最大总轮次 (防止无限循环) */
  maxTotalRounds?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MAX_TOTAL_ROUNDS = 20;

export class WorkflowExecutor {
  constructor(private readonly adapters: WorkflowExecutorAdapters) {}

  async execute(
    definition: WorkflowDefinition,
    input: JsonObject,
    options: WorkflowExecutionOptions = {},
  ): Promise<WorkflowRunState> {
    if (!definition.nodes?.length) {
      throw new Error(`Workflow ${definition.id} has no executable nodes`);
    }

    const maxTotalRounds = options.maxTotalRounds ?? DEFAULT_MAX_TOTAL_ROUNDS;
    const retryCounts = new Map<string, number>();
    const nodeMap = new Map<string, WorkflowNodeDef>();
    for (const node of definition.nodes) {
      nodeMap.set(node.id, node);
    }

    const state: WorkflowRunState = {
      context: {
        runId: `${definition.id}-${Date.now()}`,
        workflow: definition,
        targetProject: options.targetProject,
        targetProfile: options.targetProfile,
        input,
        schemas: options.schemas,
        policies: options.policies,
        resolvedTargetProfile: options.resolvedTargetProfile,
      },
      nodeResults: {},
      status: 'running',
    };

    let totalRounds = 0;
    let currentInput = input;
    let nodeIndex = 0;

    while (nodeIndex < definition.nodes!.length && totalRounds < maxTotalRounds) {
      const node = definition.nodes![nodeIndex];
      totalRounds++;

      // Check dependencies
      if (!this.dependenciesSatisfied(node, state)) {
        state.nodeResults[node.id] = {
          ok: true,
          skipped: true,
          reason: '依赖节点尚未成功完成',
        };
        nodeIndex++;
        continue;
      }

      // Check when clause
      if (!this.matchesWhenClause(node, state)) {
        state.nodeResults[node.id] = {
          ok: true,
          skipped: true,
          reason: 'when 条件未命中',
        };
        nodeIndex++;
        continue;
      }

      // Notify node start
      options.onNodeStart?.(node, state);

      // Run the node
      const result = await this.runNode(node, currentInput, state);
      state.nodeResults[node.id] = result;

      // Notify node complete
      options.onNodeComplete?.(node, result, state);

      if (result.ok) {
        // Check if this node requires approval
        if (node.requiresApproval && options.onApprovalRequired) {
          const approved = await options.onApprovalRequired(node, state);
          if (!approved) {
            state.status = 'waiting-approval';
            return state;
          }
        }

        // Use output as input for next nodes
        if (result.output) {
          currentInput = { ...currentInput, ...result.output };
        }
        nodeIndex++;
      } else {
        // Node failed — check for retry loop
        if (node.retryTarget && nodeMap.has(node.retryTarget)) {
          const retries = retryCounts.get(node.id) ?? 0;
          const maxRetries = node.maxRetries ?? DEFAULT_MAX_RETRIES;

          if (retries < maxRetries) {
            retryCounts.set(node.id, retries + 1);
            // Clear the failed result so it can be retried
            delete state.nodeResults[node.id];
            // Jump back to the retry target
            const targetIndex = definition.nodes!.findIndex(n => n.id === node.retryTarget);
            if (targetIndex >= 0) {
              nodeIndex = targetIndex;
              continue;
            }
          }
        }

        // No retry or max retries exceeded
        state.status = 'failed';
        return state;
      }
    }

    if (totalRounds >= maxTotalRounds) {
      state.status = 'failed';
      state.nodeResults['_error'] = {
        ok: false,
        error: `超过最大执行轮次 (${maxTotalRounds})，可能存在无限循环`,
      };
      return state;
    }

    if (definition.output?.primaryFrom) {
      const primaryResult = state.nodeResults[definition.output.primaryFrom];
      if (!primaryResult) {
        state.status = 'failed';
        throw new Error(`主输出节点未执行: ${definition.output.primaryFrom}`);
      }
    }

    state.status = 'completed';
    return state;
  }

  private dependenciesSatisfied(node: WorkflowNodeDef, state: WorkflowRunState): boolean {
    return (node.dependsOn ?? []).every((depId) => {
      const depResult = state.nodeResults[depId];
      return depResult?.ok === true && depResult.skipped !== true;
    });
  }

  private matchesWhenClause(node: WorkflowNodeDef, state: WorkflowRunState): boolean {
    if (!node.when) {
      return true;
    }

    const priorResults = Object.values(state.nodeResults);
    const allPassed = priorResults.every((result) => result.ok);
    const hasFailures = priorResults.some((result) => !result.ok);

    if (node.when.allPassed === true && !allPassed) {
      return false;
    }
    if (node.when.hasFailures === true && !hasFailures) {
      return false;
    }

    return true;
  }

  private async runNode(node: WorkflowNodeDef, input: JsonObject, state: WorkflowRunState): Promise<WorkflowNodeResult> {
    switch (node.type) {
      case 'agent':
        return this.adapters.runAgent(node, input, state);
      case 'plugin':
        return this.adapters.runPlugin(node, input, state);
      case 'pluginGroup':
        return this.adapters.runPluginGroup(node, input, state);
      default:
        throw new Error(`Unsupported node type: ${String(node.type)}`);
    }
  }
}
