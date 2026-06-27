/**
 * profiles — target profile 与 UI catalog 路由
 */

import { Router } from 'express';
import { getCompatibleLibraries } from '@ai-engineering-agent/agent-runtime';
import { policies } from '../lib/skill-context.js';

export function createProfilesRouter() {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const frontendFilter = req.query.frontend as string | undefined;
      const backendFilter = req.query.backend as string | undefined;
      const includeLegacy = req.query.includeLegacy === 'true';

      const profileIds = await policies.listTargetProfiles();
      const profiles = [];

      for (const id of profileIds) {
        const p = await policies.getTargetProfile(id);
        if (!p) continue;
        if (!includeLegacy && (p as Record<string, unknown>).status === 'legacy') continue;
        if (frontendFilter && p.framework !== frontendFilter) continue;
        if (backendFilter && (p as Record<string, unknown>).backend) {
          const be = (p as Record<string, unknown>).backend as Record<string, unknown> | undefined;
          if (be?.framework !== backendFilter) continue;
        }
        profiles.push({ id, ...p });
      }

      res.json(profiles);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/ui/catalog', (req, res) => {
    const framework = String(req.query.framework ?? 'vue3');
    const libs = getCompatibleLibraries(framework);
    res.json(libs);
  });

  return router;
}
