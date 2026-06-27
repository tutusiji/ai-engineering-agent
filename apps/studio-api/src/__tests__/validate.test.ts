import { describe, it, expect } from 'vitest';
import { ChatSchema, CreateSessionSchema, GenerateSchema } from '../lib/validate.js';

describe('zod schemas', () => {
  it('validates chat body', () => {
    const parsed = ChatSchema.safeParse({ sessionId: 's1', userMessage: 'hello', mode: 'gather' });
    expect(parsed.success).toBe(true);
  });

  it('rejects empty userMessage', () => {
    const parsed = ChatSchema.safeParse({ sessionId: 's1', userMessage: '', mode: 'gather' });
    expect(parsed.success).toBe(false);
  });

  it('validates create session body', () => {
    const parsed = CreateSessionSchema.safeParse({ name: 'Test' });
    expect(parsed.success).toBe(true);
  });

  it('validates generate body with defaults', () => {
    const parsed = GenerateSchema.safeParse({ sessionId: 's1' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.phaseId).toBe('P1');
    }
  });
});
