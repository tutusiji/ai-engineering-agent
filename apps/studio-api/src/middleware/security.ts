/**
 * security — Express 安全中间件配置
 */

import type { Express, Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';

const allowedOrigins = new Set([
  'https://joox.cc:4399',
  'https://joox.cc',
  'http://localhost:4400',
  'http://127.0.0.1:4400',
]);

export function setupSecurityMiddleware(app: Express): void {
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(compression());

  app.use(
    cors({
      origin: (origin, callback) => {
        // 允许无 origin 的请求（如 curl、服务器端调用）
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        callback(new Error(`CORS policy: origin ${origin} not allowed`));
      },
      credentials: true,
    }),
  );

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分钟
    max: 300, // 每 IP 每窗口最多 300 次
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown',
    handler: (_req, res) => {
      res.status(429).json({ error: 'Too many requests, please try again later.' });
    },
  });
  app.use('/api/', limiter);

  app.use(express.json({ limit: '10mb' }));
}

// 手动导出 express，因为 security.ts 需要它
import express from 'express';
export { express };
