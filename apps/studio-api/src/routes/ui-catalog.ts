/**
 * ui-catalog — UI 组件库目录路由
 */

import { Router } from 'express';
import { getCompatibleLibraries } from '@ai-engineering-agent/agent-runtime';

export function createUiCatalogRouter() {
  const router = Router();

  router.get('/', (req, res) => {
    const framework = String(req.query.framework ?? 'vue3');
    const libs = getCompatibleLibraries(framework);
    res.json(libs);
  });

  return router;
}
