/**
 * Studio API — Express server 入口
 *
 * 路由已拆分到 src/routes/ 下，server.ts 仅负责组装。
 */

import {
  initPool,
  closePool,
  runMigrations,
  SessionStore,
  RunStore,
  ArtifactStore,
  MetricsStore,
  UserStore,
} from '@ai-engineering-agent/persistence';
import { loadLlmConfigFromEnv } from '@ai-engineering-agent/agent-runtime';
import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setupSecurityMiddleware } from './middleware/security.js';
import { requireAuth } from './middleware/auth.js';
import { PORT, checkDatabaseHealth } from './lib/config.js';
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
import { createAuthRouter } from './routes/auth.js';
import { createBaselinesRouter } from './routes/baselines.js';
import { createPptRouter } from './routes/ppt.js';

const llmConfig = loadLlmConfigFromEnv();

const sessionStore = new SessionStore();
const runStore = new RunStore();
const artifactStore = new ArtifactStore();
const metricsStore = new MetricsStore();
const userStore = new UserStore();

await initPool();
await runMigrations();

const app = express();
setupSecurityMiddleware(app);

// Health (no auth)
app.get('/api/health', async (_req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const statusCode = dbHealth.ok ? 200 : 503;
  res.status(statusCode).json({
    status: dbHealth.ok ? 'ok' : 'error',
    model: llmConfig.model,
    timestamp: Date.now(),
    database: dbHealth,
  });
});

// Auth routes (no auth required)
app.use('/api/auth', createAuthRouter(userStore, sessionStore));

// All routes below require authentication
app.use('/api', requireAuth);

// Models
app.use('/api/models', createModelsRouter(llmConfig));

// Profiles & UI catalog
app.use('/api/profiles', createProfilesRouter());
app.use('/api/catalog/ui', createUiCatalogRouter());

// Sessions
app.use('/api/sessions', createSessionsRouter(sessionStore));
app.use('/api/sessions/:id/designs', createDesignVersionsRouter(sessionStore, artifactStore, llmConfig));
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

// PPT 生成（主题列表/模板上传解析/删除/素材上传）
app.use('/api/ppt', createPptRouter());

// Metrics
app.use('/api/metrics', createMetricsRouter(metricsStore));

// Visual baselines
app.use('/api/baselines', createBaselinesRouter());

// ── 生产模式：托管 studio-web 构建产物（单进程同时提供前端与 API）──
const webDist = fileURLToPath(new URL('../../studio-web/dist', import.meta.url));
const webDistIndex = fileURLToPath(new URL('../../studio-web/dist/index.html', import.meta.url));
if (existsSync(webDist)) {
  // 静态资源（assets、favicon 等）
  app.use(express.static(webDist, { index: 'index.html' }));
  // SPA 回退：GET 非 /api 路径统一返回 index.html（Express 5 不支持 '*' 通配，用中间件实现）
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      res.sendFile(webDistIndex);
    } else {
      next();
    }
  });
}

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║   Studio API running on port ${PORT}       ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`  Model: ${llmConfig.model}`);
  console.log(`  URL:   ${llmConfig.baseUrl}`);
  console.log(`  Storage: ~/.ai-studio/data/`);
});

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  server.close(async () => {
    try {
      await closePool();
      console.log('Database pool closed');
    } catch (err) {
      console.error('Error closing database pool:', err);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', (signal) => shutdown(signal));
process.on('SIGINT', (signal) => shutdown(signal));
