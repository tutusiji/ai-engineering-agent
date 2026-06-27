/**
 * validate-request — 统一请求体/参数校验中间件
 */

import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodError } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: formatZodError(parsed.error),
      });
    }
    req.body = parsed.data;
    return next();
  };
}

export function validateParams<T extends Record<string, string>>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid route parameters',
        details: formatZodError(parsed.error),
      });
    }
    req.params = parsed.data as Record<string, string>;
    return next();
  };
}

export function validateQuery<T extends Record<string, string>>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: formatZodError(parsed.error),
      });
    }
    req.query = parsed.data as Record<string, string>;
    return next();
  };
}

function formatZodError(error: ZodError<unknown>): string[] {
  return error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
}
