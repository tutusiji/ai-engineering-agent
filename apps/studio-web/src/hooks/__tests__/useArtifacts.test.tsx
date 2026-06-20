import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useArtifacts } from '../useArtifacts';

describe('useArtifacts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('derives requirement artifact from document', () => {
    const { result } = renderHook(() =>
      useArtifacts({
        sessionId: null,
        document: { featureName: '登录', businessGoal: '支持登录', completeness: 80 } as any,
        designHtml: null,
        generatedFiles: [],
      })
    );

    const req = result.current.artifacts.find(a => a.id === 'req-md');
    expect(req).toBeDefined();
    expect(req?.category).toBe('requirement');
  });

  it('fetches backend artifacts when sessionId is present', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        artifacts: [
          { id: 'design-zip:run-1', category: 'design', label: 'UI预览.zip', size: 100, updatedAt: Date.now(), source: 'artifact-run', downloadUrl: '/download' },
        ],
      }),
    });

    const { result } = renderHook(() =>
      useArtifacts({
        sessionId: 's1',
        document: null,
        designHtml: null,
        generatedFiles: [],
      })
    );

    await waitFor(() => {
      expect(result.current.artifacts).toHaveLength(1);
    });
    expect(result.current.artifacts[0].id).toBe('design-zip:run-1');
  });
});
