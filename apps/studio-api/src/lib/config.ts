/**
 * config — 应用配置与环境变量解析
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { loadLlmConfigFromEnv, type LlmConfig } from '@ai-engineering-agent/agent-runtime';
import { getPool } from '@ai-engineering-agent/persistence';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, '../../..');
export const PORT = Number(process.env.STUDIO_API_PORT ?? 4401);

export function loadLlmConfig(): LlmConfig {
  return loadLlmConfigFromEnv();
}

/** 执行数据库健康检查 */
export async function checkDatabaseHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return { ok: true, latencyMs: Date.now() - start };
    } finally {
      client.release();
    }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

export type ModelPreset = {
  baseUrl: string;
  model: string;
  label: string;
  apiKey?: string;
  temperature?: number;
};

type HermesConfig = {
  model?: {
    base_url?: string;
    default?: string;
  };
  providers?: {
    rightcode?: {
      base_url?: string;
      default?: string;
    };
  };
};

function pickEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function loadRightCodePreset(): ModelPreset | null {
  const apiKey = pickEnv('RIGHTCODE_API_KEY', 'OPENAI_API_KEY', 'LLM_API_KEY');
  if (!apiKey) return null;

  let baseUrl = 'https://right.codes/codex/v1';
  let model = 'gpt-5.5';

  try {
    const hermesConfigPath = path.join(process.env.HOME ?? '/root', '.hermes', 'config.yaml');
    if (existsSync(hermesConfigPath)) {
      const parsed = parseYaml(readFileSync(hermesConfigPath, 'utf-8')) as HermesConfig;
      baseUrl = parsed.providers?.rightcode?.base_url ?? baseUrl;
      model = parsed.providers?.rightcode?.default ?? model;
    }
  } catch (error) {
    console.warn('⚠️ Failed to read Hermes right.codes config:', error);
  }

  model = pickEnv('RIGHTCODE_MODEL', 'OPENAI_MODEL') ?? model;

  return {
    baseUrl,
    model,
    label: model,
    apiKey,
  };
}

export function buildModelPresets(): Record<string, ModelPreset> {
  const presets: Record<string, ModelPreset> = {};

  const deepseekApiKey = pickEnv('DEEPSEEK_API_KEY');
  if (deepseekApiKey) {
    presets['deepseek-v4-pro'] = {
      baseUrl: pickEnv('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com',
      model: pickEnv('DEEPSEEK_MODEL') ?? 'deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      apiKey: deepseekApiKey,
    };
  }

  const rightCodePreset = loadRightCodePreset();
  if (rightCodePreset) {
    presets.rightcode = rightCodePreset;
  }

  return presets;
}

export { type LlmConfig };
