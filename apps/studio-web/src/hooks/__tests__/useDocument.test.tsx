import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useDocument } from '../useDocument';

describe('useDocument', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initially has null document', () => {
    const { result } = renderHook(() => useDocument('s1'));
    expect(result.current.document).toBeNull();
    expect(result.current.completeness).toBe(0);
  });

  it('loads document manually', async () => {
    const doc = { featureName: 'Test', completeness: 50 };
    (fetch as any).mockResolvedValueOnce({ json: async () => ({ ok: true, document: doc }) });

    const { result } = renderHook(() => useDocument('s1'));

    await act(async () => {
      await result.current.generate();
    });

    expect(fetch).toHaveBeenCalledWith('/api/chat/document/generate', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 's1' }),
    }));
    await waitFor(() => expect(result.current.document).toEqual(doc));
    expect(result.current.completeness).toBe(50);
  });
});
