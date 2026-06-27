import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { useSessions } from '../useSessions';

describe('useSessions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads sessions and auto-selects first', async () => {
    const sessions = [{ id: 's1', name: 'Session 1' }];
    (fetch as any).mockResolvedValueOnce({ json: async () => sessions });

    const { result } = renderHook(() => useSessions());

    await waitFor(() => expect(result.current.sessions).toEqual(sessions));
    expect(result.current.activeSessionId).toBe('s1');
  });

  it('creates a session and selects it', async () => {
    (fetch as any)
      .mockResolvedValueOnce({ json: async () => [] })
      .mockResolvedValueOnce({ json: async () => ({ id: 's2', name: 'New' }) });

    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.sessions).toEqual([]));

    await act(async () => {
      await result.current.createSession('profile1', 'New Session');
    });

    expect(fetch).toHaveBeenCalledWith('/api/sessions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ profileId: 'profile1', name: 'New Session' }),
    }));
  });
});
