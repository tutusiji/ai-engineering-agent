/**
 * Studio API — Express server 入口
 *
 * 路由已拆分到 src/routes/ 下，server.ts 仅负责组装。
 */

import { initPool, SessionStore, RunStore, ArtifactStore, MetricsStore } from '@ai-engineering-agent/persistence';
import { loadLlmConfigFromEnv } from '@ai-engineering-agent/agent-runtime';
import express from 'express';
import { setupSecurityMiddleware } from './middleware/security.js';
import { PORT } from './lib/config.js';
import { createModelsRouter } from './routes/models.js';
import { createProfilesRouter } from './routes/profiles.js';
import { createUiCatalogRouter } from './routes/ui-catalog.js';
import { createSessionsRouter } from './routes/sessions.js';
import { createDesignVersionsRouter } from './routes/design-versions.js';
import { createArchitectureVersionsRouter } from './routes/architecture-versions.js';
import { createChatRouter } from './routes/chat.js';
import { createGenerateRouter } from './routes/generate.js';
import { createWorkflowsRouter } from './routes/workflows.js';
import { createRunsRouter } from './routes/runs.js';
import { createArtifactsRouter } from './routes/artifacts.js';
import { createMetricsRouter } from './routes/metrics.js';

const llmConfig = loadLlmConfigFromEnv();

const sessionStore = new SessionStore();
const runStore = new RunStore();
const artifactStore = new ArtifactStore();
const metricsStore = new MetricsStore();

await initPool();
await metricsStore.ensureTable();

const app = express();
setupSecurityMiddleware(app);

// Health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', model: llmConfig.model, timestamp: Date.now() });
});

// Models
app.use('/api/models', createModelsRouter(llmConfig));

// Profiles & UI catalog
app.use('/api/profiles', createProfilesRouter());
app.use('/api/catalog/ui', createUiCatalogRouter());

// Sessions
app.use('/api/sessions', createSessionsRouter(sessionStore));
app.use('/api/sessions/:id/designs', createDesignVersionsRouter(sessionStore));
app.use('/api/sessions/:id/architectures', createArchitectureVersionsRouter(sessionStore, artifactStore, llmConfig));

// Chat
app.use('/api/chat', createChatRouter(llmConfig, sessionStore));

// Generation
app.use('/api/generate', createGenerateRouter(llmConfig, sessionStore, artifactStore));

// Workflows & runs
app.use('/api/workflows', createWorkflowsRouter(llmConfig, sessionStore, runStore, artifactStore));
app.use('/api/runs', createRunsRouter(runStore, artifactStore));

// Session artifacts
app.use('/api/sessions/:id/artifacts', createArtifactsRouter(sessionStore, artifactStore));

// Metrics
app.use('/api/metrics', createMetricsRouter(metricsStore));

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║   Studio API running on port ${PORT}       ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`  Model: ${llmConfig.model}`);
  console.log(`  URL:   ${llmConfig.baseUrl}`);
  console.log(`  Storage: ~/.ai-studio/data/`);
});
