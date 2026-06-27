import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArtifactStore } from '@ai-engineering-agent/persistence';
import { buildSessionArtifacts } from '../artifact-service.js';

describe('buildSessionArtifacts', () => {
  let baseDir: string;
  let store: ArtifactStore;

  beforeEach(() => {
    baseDir = join(tmpdir(), `artifact-test-${Date.now()}`);
    mkdirSync(baseDir, { recursive: true });
    store = new ArtifactStore(baseDir);
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('builds session-state artifacts from document and designHtml', () => {
    const session = {
      id: 's1',
      name: 'test',
      messages: [],
      completeness: 0,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      document: {
        featureName: '登录',
        businessGoal: '支持用户登录',
        completeness: 60,
      },
    };

    const artifacts = buildSessionArtifacts(session, 's1', store, '<html></html>');
    expect(artifacts.some(a => a.id === 'req-md' && a.category === 'requirement')).toBe(true);
    expect(artifacts.some(a => a.id === 'design-html' && a.category === 'design')).toBe(true);
  });

  it('includes artifact-run items from _artifactRuns', () => {
    store.save('design-123', 'index.html', '<html></html>');
    const session = {
      id: 's1',
      name: 'test',
      messages: [],
      completeness: 0,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      document: {
        _artifactRuns: [{ runId: 'design-123', type: 'design', createdAt: Date.now() }],
      },
    };

    const artifacts = buildSessionArtifacts(session, 's1', store, null);
    expect(artifacts.some(a => a.id === 'design-zip:design-123' && a.category === 'design')).toBe(true);
  });
});
