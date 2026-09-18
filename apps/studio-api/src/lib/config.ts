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
    /** 形如 custom:ark-plan，冒号后为 providers 键名 */
    provider?: string;
    api_key?: string;
  };
  providers?: Record<
    string,
    | {
        base_url?: string;
        default?: string;
        /** ark 类 provider 的 chat-completions 兼容端点 */
        api?: string;
        /** 密钥所在的环境变量名 */
        key_env?: string;
        default_model?: string;
      }
    | undefined
  >;
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

/** 从 ~/.hermes/.env 逐行查找 KEY=value（hermes 的密钥保存在自己的 dotenv 文件中） */
function readHermesDotenv(key: string): string | undefined {
  try {
    const envPath = path.join(process.env.HOME ?? '/root', '.hermes', '.env');
    if (!existsSync(envPath)) return undefined;
    const prefix = `${key}=`;
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith(prefix)) continue;
      const value = trimmed
        .slice(prefix.length)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      return value || undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** 从 hermes 配置读取其默认模型（ark-code-latest）封装为预设；任一要素缺失即返回 null（fail-soft） */
function loadArkPreset(): ModelPreset | null {
  try {
    const hermesConfigPath = path.join(process.env.HOME ?? '/root', '.hermes', 'config.yaml');
    if (!existsSync(hermesConfigPath)) return null;
    const parsed = parseYaml(readFileSync(hermesConfigPath, 'utf-8')) as HermesConfig;
    const providerId = parsed.model?.provider?.replace(/^custom:/, '');
    const provider = providerId ? parsed.providers?.[providerId] : undefined;
    const modelId = parsed.model?.default ?? provider?.default_model;
    // ark 类 provider 的 api 字段是 chat-completions 兼容端点（llm-client 会在其后拼 /chat/completions）
    const baseUrl = provider?.api ?? parsed.model?.base_url;
    if (!providerId || !modelId || !baseUrl) return null;
    const keyEnvName = provider?.key_env ?? 'ARK_API_KEY';
    const apiKey = pickEnv(keyEnvName) ?? readHermesDotenv(keyEnvName) ?? parsed.model?.api_key;
    if (!apiKey) return null;
    return {
      baseUrl,
      model: modelId,
      label: modelId,
      apiKey,
    };
  } catch (error) {
    console.warn('⚠️ Failed to read Hermes ark config:', error);
    return null;
  }
}

export function buildModelPresets(): Record<string, ModelPreset> {
  const presets: Record<string, ModelPreset> = {};

  const deepseekApiKey = pickEnv('DEEPSEEK_API_KEY');
  if (deepseekApiKey) {
    const deepseekBase = pickEnv('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com';
    // DeepSeek API 实际只暴露 deepseek-flash / deepseek-v4-pro 两个模型名（GET /models 实测），
    // V4.1-Flash 世代对应 flash 档位；V4-Flash 与 Vision-Exp 该 key 暂未提供。
    // DEEPSEEK_MODEL 仅决定服务启动时的默认激活档（见 .env），不参与预设定义
    presets['deepseek-v4.1-flash'] = {
      baseUrl: deepseekBase,
      model: 'deepseek-flash',
      label: 'DeepSeek V4.1 Flash',
      apiKey: deepseekApiKey,
    };
    presets['deepseek-v4-pro'] = {
      baseUrl: deepseekBase,
      model: 'deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      apiKey: deepseekApiKey,
    };
  }

  const rightCodePreset = loadRightCodePreset();
  if (rightCodePreset) {
    presets.rightcode = rightCodePreset;
  }

  const arkPreset = loadArkPreset();
  if (arkPreset) {
    presets.ark = arkPreset;
  }

  return presets;
}

export { type LlmConfig };
