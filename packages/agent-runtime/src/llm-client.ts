/**
 * OpenAI-compatible LLM HTTP client.
 *
 * Works with any provider that exposes the /v1/chat/completions endpoint:
 * OpenRouter, DeepSeek, local vLLM, etc.
 */

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
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
export async function chatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
): Promise<LlmCallResult> {
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
  const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 minutes

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
    throw new Error(
      `LLM request failed (${response.status}): ${errorText || response.statusText}`,
    );
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
 * Priority:
 *   LLM_BASE_URL + LLM_API_KEY + LLM_MODEL  (generic override)
 *   KIMI_API_KEY                              (Kimi / Moonshot)
 *   DEEPSEEK_BASE_URL + DEEPSEEK_API_KEY         (DeepSeek)
 *   OPENROUTER_API_KEY                        (OpenRouter)
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
      temperature: 1,  // Kimi requires temperature=1
    };
  }

  // Xiaomi MiMo
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
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
    'No LLM credentials found. Set LLM_BASE_URL + LLM_API_KEY, ' +
    'or KIMI_API_KEY, or DEEPSEEK_API_KEY, or OPENROUTER_API_KEY in your environment.',
  );
}
