/**
 * models — 模型预设相关路由
 */

import { Router } from 'express';
import type { LlmConfig } from '@ai-engineering-agent/agent-runtime';
import { applyModelPreset, listModelPresets } from '../lib/models.js';
import { validateBody } from '../middleware/validate-request.js';
import { SwitchModelSchema } from '../lib/validate.js';

export function createModelsRouter(llmConfig: LlmConfig) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(listModelPresets(llmConfig.model));
  });

  router.get('/current', (_req, res) => {
    res.json({
      model: llmConfig.model,
      baseUrl: llmConfig.baseUrl,
    });
  });

  router.post('/switch', validateBody(SwitchModelSchema), (req, res) => {
    const { modelId } = req.body;
    const result = applyModelPreset(llmConfig, modelId);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    Object.assign(llmConfig, result.config);
    res.json({ ok: true, model: llmConfig.model, label: result.config?.label ?? modelId });
  });

  return router;
}
