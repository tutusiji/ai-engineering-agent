/**
 * models — 模型预设运行时管理
 */

import { type LlmConfig } from '@ai-engineering-agent/agent-runtime';
import { buildModelPresets, type ModelPreset } from './config.js';

export const MODEL_PRESETS: Record<string, ModelPreset> = buildModelPresets();

export function applyModelPreset(llmConfig: LlmConfig, modelId: string): { ok: boolean; config?: LlmConfig; error?: string } {
  const preset = MODEL_PRESETS[modelId];
  if (!preset) {
    return { ok: false, error: `Unknown model: ${modelId}. Available: ${Object.keys(MODEL_PRESETS).join(', ')}` };
  }
  if (!preset.apiKey) {
    return { ok: false, error: `Model preset is not fully configured: ${modelId}` };
  }

  return {
    ok: true,
    config: {
      ...llmConfig,
      baseUrl: preset.baseUrl,
      apiKey: preset.apiKey,
      model: preset.model,
      temperature: preset.temperature,
    },
  };
}

export function listModelPresets(currentModel: string) {
  return Object.entries(MODEL_PRESETS).map(([id, preset]) => ({
    id,
    label: preset.label,
    model: preset.model,
    active: currentModel === preset.model,
  }));
}
