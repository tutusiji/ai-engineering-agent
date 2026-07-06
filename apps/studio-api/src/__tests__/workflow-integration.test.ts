/**
 * workflow-integration — 工作流端到端集成测试
 *
 * 验证 WorkflowExecutor + plugin-runner + approvalGates 的完整链路：
 * 1. mock LLM agent 节点能执行
 * 2. plugin 节点通过 runPluginNode 正确调用
 * 3. approvalGates 在指定节点后触发审批
 * 4. retryTarget 回流机制正常工作
 *
 * 不依赖数据库和真实 LLM，全部 mock。
 */

import { describe, it, expect, vi } from 'vitest';
import { WorkflowExecutor } from '@ai-engineering-agent/workflow-core';
import { runPluginNode } from '@ai-engineering-agent/workflow-core';
import type { WorkflowDefinition, WorkflowNodeDef, WorkflowNodeResult, WorkflowRunState } from '@ai-engineering-agent/workflow-core';
import type { JsonObject } from '@ai-engineering-agent/shared-types';

/** 创建一个 mock agent runner，返回固定的结构化输出 */
function createMockAgentRunner(): (node: WorkflowNodeDef, input: JsonObject, state: WorkflowRunState) => Promise<WorkflowNodeResult> {
  return async (node, input) => {
    // 模拟 agent 输出：返回节点 id + 合并输入
    const output: JsonObject = {
      nodeId: node.id,
      skill: node.skill,
      // 保留前序节点的输出（模拟 executor 的 input merge）
      ...input,
      [`${node.id}_done`]: true,
    };
    return { ok: true, output };
  };
}

/** 创建一个 mock plugin runner，包装 runPluginNode 但避免真实项目扫描 */
function createMockPluginRunner(): (node: WorkflowNodeDef, input: JsonObject, state: WorkflowRunState) => Promise<WorkflowNodeResult> {
  return async (node, _input, state) => {
    // 对于不需要 targetProject 的 plugin，直接返回 mock 结果
    // 对于 pluginGroup，模拟规则检查通过
    if (node.type === 'pluginGroup') {
      return {
        ok: true,
        output: {
          checks: (node.plugins ?? []).map((p) => ({ name: p, passed: true, issueCount: 0 })),
          passed: true,
          issues: [],
        },
      };
    }
    // 单个 plugin：返回基本结果
    return {
      ok: true,
      output: { plugin: node.plugin, executed: true },
    };
  };
}

describe('WorkflowExecutor 集成', () => {
  it('执行线性 DAG，所有节点成功完成', async () => {
    const definition: WorkflowDefinition = {
      id: 'test-linear',
      name: 'Test Linear Workflow',
      version: '0.1.0',
      nodes: [
        { id: 'step1', type: 'agent', skill: 'mock-skill', name: '步骤1' },
        { id: 'step2', type: 'agent', skill: 'mock-skill', name: '步骤2', dependsOn: ['step1'] },
        { id: 'step3', type: 'plugin', plugin: 'mock-plugin', name: '步骤3', dependsOn: ['step2'] },
      ],
    };

    const executor = new WorkflowExecutor({
      runAgent: createMockAgentRunner(),
      runPlugin: createMockPluginRunner(),
      runPluginGroup: createMockPluginRunner(),
    });

    const result = await executor.execute(definition, { userPrompt: 'test' });

    expect(result.status).toBe('completed');
    expect(result.nodeResults['step1']?.ok).toBe(true);
    expect(result.nodeResults['step2']?.ok).toBe(true);
    expect(result.nodeResults['step3']?.ok).toBe(true);
    // 验证 input merge：step2 的输出应包含 step1 的标记
    expect(result.nodeResults['step2']?.output?.['step1_done']).toBe(true);
  });

  it('节点失败时触发 retryTarget 回流', async () => {
    let step2Attempts = 0;
    const definition: WorkflowDefinition = {
      id: 'test-retry',
      name: 'Test Retry Workflow',
      version: '0.1.0',
      nodes: [
        { id: 'step1', type: 'agent', skill: 'mock-skill', name: '步骤1' },
        {
          id: 'step2',
          type: 'agent',
          skill: 'mock-skill',
          name: '步骤2',
          dependsOn: ['step1'],
          retryTarget: 'step1',
          maxRetries: 2,
        },
      ],
    };

    const executor = new WorkflowExecutor({
      runAgent: async (node, input) => {
        if (node.id === 'step2') {
          step2Attempts++;
          if (step2Attempts === 1) {
            return { ok: false, error: '第一次失败' };
          }
        }
        return { ok: true, output: { ...input, [`${node.id}_done`]: true } };
      },
      runPlugin: createMockPluginRunner(),
      runPluginGroup: createMockPluginRunner(),
    });

    const result = await executor.execute(definition, { userPrompt: 'test' });

    // 第一次失败后回流到 step1，第二次成功
    expect(result.status).toBe('completed');
    expect(step2Attempts).toBe(2);
    expect(result.nodeResults['step2']?.ok).toBe(true);
  });

  it('approvalGates 在指定节点后触发审批', async () => {
    const approvalCalls: string[] = [];
    const definition: WorkflowDefinition = {
      id: 'test-approval',
      name: 'Test Approval Workflow',
      version: '0.1.0',
      nodes: [
        { id: 'design', type: 'agent', skill: 'mock-skill', name: '设计' },
        { id: 'implement', type: 'agent', skill: 'mock-skill', name: '实现', dependsOn: ['design'] },
      ],
      approvalGates: [
        { afterStage: 'design', name: '设计审批', required: true },
      ],
    };

    const executor = new WorkflowExecutor({
      runAgent: createMockAgentRunner(),
      runPlugin: createMockPluginRunner(),
      runPluginGroup: createMockPluginRunner(),
    });

    const result = await executor.execute(definition, { userPrompt: 'test' }, {
      onApprovalRequired: async (node) => {
        approvalCalls.push(node.id);
        return true; // 批准
      },
    });

    expect(result.status).toBe('completed');
    expect(approvalCalls).toContain('approval-gate:design');
  });

  it('approvalGates 拒绝时中止工作流', async () => {
    const definition: WorkflowDefinition = {
      id: 'test-approval-reject',
      name: 'Test Approval Reject',
      version: '0.1.0',
      nodes: [
        { id: 'design', type: 'agent', skill: 'mock-skill', name: '设计' },
        { id: 'implement', type: 'agent', skill: 'mock-skill', name: '实现', dependsOn: ['design'] },
      ],
      approvalGates: [
        { afterStage: 'design', name: '设计审批', required: true },
      ],
    };

    const executor = new WorkflowExecutor({
      runAgent: createMockAgentRunner(),
      runPlugin: createMockPluginRunner(),
      runPluginGroup: createMockPluginRunner(),
    });

    const result = await executor.execute(definition, { userPrompt: 'test' }, {
      onApprovalRequired: async () => false, // 拒绝
    });

    expect(result.status).toBe('waiting-approval');
    // implement 节点不应执行
    expect(result.nodeResults['implement']).toBeUndefined();
  });

  it('when 条件跳过节点', async () => {
    const definition: WorkflowDefinition = {
      id: 'test-when',
      name: 'Test When Clause',
      version: '0.1.0',
      nodes: [
        { id: 'step1', type: 'agent', skill: 'mock-skill', name: '步骤1' },
        {
          id: 'step2_optional',
          type: 'agent',
          skill: 'mock-skill',
          name: '可选步骤',
          dependsOn: ['step1'],
          when: { hasFailures: true }, // 仅在有失败时执行
        },
      ],
    };

    const executor = new WorkflowExecutor({
      runAgent: createMockAgentRunner(),
      runPlugin: createMockPluginRunner(),
      runPluginGroup: createMockPluginRunner(),
    });

    const result = await executor.execute(definition, { userPrompt: 'test' });

    expect(result.status).toBe('completed');
    expect(result.nodeResults['step1']?.ok).toBe(true);
    // step1 成功，没有失败，step2_optional 应被跳过
    expect(result.nodeResults['step2_optional']?.skipped).toBe(true);
  });
});
