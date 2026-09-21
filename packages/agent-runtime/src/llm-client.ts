/**
 * OpenAI-compatible LLM HTTP client.
 *
 * Works with any provider that exposes the /v1/chat/completions endpoint:
 * Xiaomi MiMo, OpenRouter, DeepSeek, local vLLM, etc.
 */

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  /** 整体超时毫秒（默认 5 分钟）— 长输出任务可放宽至 10-15 分钟 */
  timeoutMs?: number;
  thinking?: { type: 'enabled' | 'disabled' };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletion {
  id: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LlmCallResult {
  content: string;
  usage?: ChatCompletion['usage'];
  model: string;
}

/**
 * Send a chat completion request to an OpenAI-compatible endpoint.
 */
export async function chatCompletion(config: LlmConfig, messages: ChatMessage[]): Promise<LlmCallResult> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: config.temperature ?? 0.2,
    max_tokens: config.maxTokens ?? 131072,
  };

  // Kimi K2.6 thinking parameter
  if (config.thinking) {
    body.thinking = config.thinking;
  }

  const controller = new AbortController();
  // 整体超时可配（config.timeoutMs）— 长输出任务（UI 预览 HTML 等）需要 10 分钟级
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 5 * 60 * 1000);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(`LLM request failed (${response.status}):`, errorText || response.statusText);
    throw new Error(`LLM request failed (${response.status}): ${errorText || response.statusText}`);
  }

  const data = (await response.json()) as ChatCompletion;
  console.log('LLM response:', JSON.stringify(data).substring(0, 500));

  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    console.error('LLM returned empty content:', JSON.stringify(choice));
    throw new Error('LLM returned empty response');
  }

  return {
    content: choice.message.content,
    usage: data.usage,
    model: data.model ?? config.model,
  };
}

/**
 * Build LlmConfig from environment variables.
 *
 * Priority (first match wins):
 *   LLM_BASE_URL + LLM_API_KEY   (generic override)
 *   KIMI_API_KEY                  (Kimi / Moonshot)
 *   DEEPSEEK_API_KEY              (DeepSeek V4 Pro)
 *   XIAOMI_API_KEY                (Xiaomi MiMo)
 *   RIGHTCODE_API_KEY             (Right.codes / OpenAI-compatible)
 *   OPENROUTER_API_KEY            (OpenRouter)
 */
export function loadLlmConfigFromEnv(): LlmConfig {
  // Generic override — highest priority
  if (process.env.LLM_BASE_URL && process.env.LLM_API_KEY) {
    return {
      baseUrl: process.env.LLM_BASE_URL,
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
    };
  }

  // Kimi / Moonshot
  if (process.env.KIMI_API_KEY) {
    return {
      baseUrl: process.env.KIMI_BASE_URL ?? 'https://api.moonshot.cn/v1',
      apiKey: process.env.KIMI_API_KEY,
      model: process.env.KIMI_MODEL ?? 'kimi-k2.6',
      temperature: 1, // Kimi requires temperature=1
    };
  }

  // DeepSeek
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-pro',
    };
  }

  // Xiaomi MiMo
  if (process.env.XIAOMI_API_KEY) {
    return {
      baseUrl: process.env.XIAOMI_BASE_URL ?? 'https://api.xiaomimimo.com/v1',
      apiKey: process.env.XIAOMI_API_KEY,
      model: process.env.XIAOMI_MODEL ?? 'mimo-v2.5-pro',
    };
  }

  // Right.codes (OpenAI-compatible)
  if (process.env.RIGHTCODE_API_KEY) {
    return {
      baseUrl: 'https://right.codes/codex/v1',
      apiKey: process.env.RIGHTCODE_API_KEY,
      model: process.env.RIGHTCODE_MODEL ?? 'gpt-5.5',
    };
  }

  // OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    return {
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4',
    };
  }

  throw new Error(
    'No LLM credentials found. Set DEEPSEEK_API_KEY, RIGHTCODE_API_KEY, KIMI_API_KEY, ' +
      'or OPENROUTER_API_KEY in your environment.'
  );
}

/**
 * 按 provider 构造 LlmConfig（env 驱动，与 loadLlmConfigFromEnv 的构造逻辑同源）。
 * 缺 key 返回 undefined。
 */
function providerConfigFor(provider: string): LlmConfig | undefined {
  switch (provider) {
    case 'deepseek':
      return process.env.DEEPSEEK_API_KEY
        ? {
            baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
            apiKey: process.env.DEEPSEEK_API_KEY,
            model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-pro',
          }
        : undefined;
    case 'kimi':
      return process.env.KIMI_API_KEY
        ? {
            baseUrl: process.env.KIMI_BASE_URL ?? 'https://api.moonshot.cn/v1',
            apiKey: process.env.KIMI_API_KEY,
            model: process.env.KIMI_MODEL ?? 'kimi-k2.6',
            temperature: 1, // Kimi requires temperature=1
          }
        : undefined;
    case 'ark':
      return process.env.ARK_API_KEY
        ? {
            baseUrl: process.env.ARK_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/plan/v3',
            apiKey: process.env.ARK_API_KEY,
            model: process.env.ARK_MODEL ?? 'ark-code-latest',
          }
        : undefined;
    case 'xiaomi':
      return process.env.XIAOMI_API_KEY
        ? {
            baseUrl: process.env.XIAOMI_BASE_URL ?? 'https://api.xiaomimimo.com/v1',
            apiKey: process.env.XIAOMI_API_KEY,
            model: process.env.XIAOMI_MODEL ?? 'mimo-v2.5-pro',
          }
        : undefined;
    case 'rightcode':
      return process.env.RIGHTCODE_API_KEY
        ? {
            baseUrl: 'https://right.codes/codex/v1',
            apiKey: process.env.RIGHTCODE_API_KEY,
            model: process.env.RIGHTCODE_MODEL ?? 'gpt-5.5',
          }
        : undefined;
    default:
      return undefined;
  }
}

/** 模型名 → provider 映射（resolveProviderConfig 按 skill.defaultModel.model 查表用） */
const MODEL_PROVIDER_MAP: Record<string, string> = {
  'deepseek-flash': 'deepseek',
  'deepseek-v4-pro': 'deepseek',
  'kimi-k2.6': 'kimi',
  'ark-code-latest': 'ark',
  'mimo-v2.5-pro': 'xiaomi',
  'gpt-5.5': 'rightcode',
};

/**
 * 按具体模型名解析完整 LlmConfig（切换 baseUrl/apiKey/model 三元组）。
 * 供 skill.defaultModel.model 显式指定跨 provider 模型时使用（如重任务 skill 路由到
 * DeepSeek——ark-code-latest 实际为 GLM 推理模型，架构/设计重任务 5 分钟内无法完成）。
 * 查无命中返回 undefined，调用方保持默认 config。
 */
export function resolveProviderConfig(modelName: string): LlmConfig | undefined {
  const provider = MODEL_PROVIDER_MAP[modelName];
  return provider ? providerConfigFor(provider) : undefined;
}
