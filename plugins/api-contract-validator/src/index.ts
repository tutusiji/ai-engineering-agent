import type { JsonObject } from '../../../packages/shared-types/src';

export interface ValidationInput {
  apiContract: JsonObject;
  generatedFiles: Array<{ path: string; content: string }>;
}

export interface ValidationOutput {
  ok: boolean;
  issues: Array<{ severity: 'low' | 'medium' | 'high' | 'critical'; endpoint?: string; message: string }>;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function validateApiContract(input: ValidationInput): ValidationOutput {
  const issues: ValidationOutput['issues'] = [];
  const endpoints = (input.apiContract.endpoints as JsonObject[]) ?? [];
  const allSourceCode = input.generatedFiles
    .filter(f => f.path.endsWith('.ts') || f.path.endsWith('.py') || f.path.endsWith('.go'))
    .map(f => f.content)
    .join('\n');

  for (const ep of endpoints) {
    const method = String(ep.method ?? '').toUpperCase();
    const path = String(ep.path ?? '');
    const pathPattern = escapeRegex(path);

    const routePatterns: Record<string, RegExp[]> = {
      GET: [/@Get\(['"`]\s*${pathPattern}/, /\.get\(['"`]\s*${pathPattern}/i, /\.GET\(['"`]\s*${pathPattern}/],
      POST: [/@Post\(['"`]\s*${pathPattern}/, /\.post\(['"`]\s*${pathPattern}/i, /\.POST\(['"`]\s*${pathPattern}/],
      PUT: [/@Put\(['"`]\s*${pathPattern}/, /\.put\(['"`]\s*${pathPattern}/i, /\.PUT\(['"`]\s*${pathPattern}/],
      PATCH: [/@Patch\(['"`]\s*${pathPattern}/, /\.patch\(['"`]\s*${pathPattern}/i, /\.PATCH\(['"`]\s*${pathPattern}/],
      DELETE: [/@Delete\(['"`]\s*${pathPattern}/, /\.delete\(['"`]\s*${pathPattern}/i, /\.DELETE\(['"`]\s*${pathPattern}/],
    };

    const patterns = routePatterns[method] ?? [];
    const found = patterns.some(p => p.test(allSourceCode));
    if (!found) {
      issues.push({ severity: 'high', endpoint: `${method} ${path}`, message: `API contract endpoint ${method} ${path} not found in generated source code` });
    }
  }
  return { ok: issues.length === 0, issues };
}
