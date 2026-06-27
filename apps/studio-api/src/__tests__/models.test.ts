import { describe, it, expect } from 'vitest';
import { applyModelPreset, listModelPresets } from '../lib/models.js';

describe('models lib', () => {
  it('lists presets with active flag', () => {
    const current = 'deepseek-v4-pro';
    const list = listModelPresets(current);
    expect(list.length).toBeGreaterThanOrEqual(0);
    expect(list.every(m => typeof m.active === 'boolean')).toBe(true);
  });

  it('rejects unknown model preset', () => {
    const llmConfig = { model: 'test', baseUrl: 'http://localhost', apiKey: 'key' };
    const result = applyModelPreset(llmConfig, 'unknown-model');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unknown model');
  });
});
