// packages/workflow-core/src/__tests__/ppt-workflow.test.ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadWorkflowFile } from '../loader.js';
import { validateWorkflowDefinition } from '../validator.js';

const W = (name: string) => fileURLToPath(new URL(`../../../../workflows/${name}`, import.meta.url));

describe('PPT 工作流定义（拆分两段）', () => {
  it('ppt-outline：plugin → agent，无闸门', async () => {
    const { definition } = await loadWorkflowFile(W('ppt-outline.yaml'));
    expect(validateWorkflowDefinition(definition)).toHaveLength(0);
    const nodes = definition.nodes ?? [];
    expect(nodes.map((n) => n.id)).toEqual(['source_collect', 'outline_planning']);
    expect(nodes.map((n) => n.plugin ?? n.skill)).toEqual(['ppt-source-collector', 'ppt-outline-planning']);
    expect(definition.output?.primaryFrom).toBe('outline_planning');
    expect(definition.approvalGates ?? []).toHaveLength(0);
  });

  it('ppt-build：agent → plugin，无 retryTarget（重试由前端改大纲驱动）', async () => {
    const { definition } = await loadWorkflowFile(W('ppt-build.yaml'));
    expect(validateWorkflowDefinition(definition)).toHaveLength(0);
    const nodes = definition.nodes ?? [];
    expect(nodes.map((n) => n.id)).toEqual(['content_polish', 'pptx_build']);
    expect(nodes.map((n) => n.plugin ?? n.skill)).toEqual(['ppt-content-polish', 'pptx-builder']);
    expect(nodes.every((n) => !n.retryTarget)).toBe(true);
    expect(definition.output?.primaryFrom).toBe('pptx_build');
  });
});
