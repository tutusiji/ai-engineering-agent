import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useChat } from '../useChat';

class MockReadableStream {
  private chunks: string[];
  private index = 0;

  constructor(chunks: string[]) {
    this.chunks = chunks;
  }

  getReader() {
    return {
      read: async () => {
        if (this.index >= this.chunks.length) {
          return { done: true, value: undefined };
        }
        const chunk = this.chunks[this.index++];
        const encoder = new TextEncoder();
        return { done: false, value: encoder.encode(chunk) };
      },
    };
  }
}

describe('useChat', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a message and stores user message', async () => {
    const body = `data: ${JSON.stringify({ content: 'Hello' })}\n\ndata: [DONE]\n\n`;
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      body: new MockReadableStream([body]),
    });

    const { result } = renderHook(() => useChat('s1', ''));

    await act(async () => {
      await result.current.send('hi');
    });

    expect(fetch).toHaveBeenCalledWith('/api/chat/stream', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sessionId: 's1', profileId: '', userMessage: 'hi' }),
    }));
  });
});
