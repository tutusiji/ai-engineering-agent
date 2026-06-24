import { describe, it, expect } from 'vitest';
import type { ArtifactItem, SessionArtifactRun } from '@ai-engineering-agent/shared-types';

describe('artifact types compile', () => {
  it('accepts a valid artifact item', () => {
    const item: ArtifactItem = {
      id: 'req-md',
      category: 'requirement',
      label: '需求文档.md',
      size: 1024,
      updatedAt: Date.now(),
      source: 'session-state',
      content: '# title',
    };
    expect(item.id).toBe('req-md');
  });

  it('accepts a valid artifact run', () => {
    const run: SessionArtifactRun = {
      runId: 'design-abc',
      type: 'design',
      createdAt: Date.now(),
    };
    expect(run.type).toBe('design');
  });
});
