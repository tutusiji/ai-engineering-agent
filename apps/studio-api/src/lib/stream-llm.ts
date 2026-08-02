/**
 * stream-llm — 流式 LLM 调用助手
 *
 * 封装「构建 SSE 响应头 → fetch LLM → 转发 OpenAI 流 → 逐行回调」的公共逻辑,
 * 供 /code/stream 与 /code/refine 复用,消除重复的 reader/decoder 代码。
 */

import type { Response } from 'express';
import type { LlmConfig } from '@ai-engineering-agent/agent-runtime';

/**
 * 从累积文本中提取已出现的文件路径(用于进度提示,非权威解析)
 *
 * 说明:generatedFiles 数组的每个元素开头必然有 "path" 字段,因此路径出现顺序
 * 大致等于文件生成顺序。content 内部虽可能含 "path": 文本,但进度仅作指示,
 * 最终文件仍由收尾的 extractJson 权威解析,少量误报可容忍。
 *
 * @param text 已累积的流式文本
 * @param limit 提取上限,防止恶意长流
 * @returns 去重后的文件路径数组
 */
export function extractFilePaths(text: string, limit = 100): string[] {
  const paths: string[] = [];
  const re = /"path"\s*:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const p = m[1];
    // 跳过明显异常路径(穿越目录),仅保留普通路径
    if (p && !p.includes('..') && !paths.includes(p)) {
      paths.push(p);
    }
    if (paths.length >= limit) break;
  }
  return paths;
}

/**
 * 创建 SSE 发送器:写响应头并返回一个 send(event, data) 函数
 */
export function createSseSender(res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  return (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}

export interface StreamLlmParams {
  /** 已解析好模型、温度、maxTokens 的配置 */
  llmConfig: LlmConfig;
  /** 请求消息(注意:调用方需自行把 skill.defaultModel 的覆盖合并进 llmConfig) */
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  /** 用于支持客户端断开时取消上游请求 */
  signal?: AbortSignal;
  /** 收到增量文本时回调(delta, 累积全文) */
  onChunk?: (delta: string, fullContent: string) => void;
}

export interface StreamLlmResult {
  fullContent: string;
  finishReason: string;
}

/**
 * 调用 LLM 并逐行消费 OpenAI 流式响应
 *
 * @throws 上游请求失败或响应体不可读时抛错
 */
export async function streamLlm(params: StreamLlmParams): Promise<StreamLlmResult> {
  const { llmConfig, messages, signal, onChunk } = params;

  const url = `${llmConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body = {
    model: llmConfig.model,
    messages,
    temperature: llmConfig.temperature ?? 0.15,
    max_tokens: llmConfig.maxTokens ?? 65536,
    stream: true,
  };

  const llmRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llmConfig.apiKey}` },
    body: JSON.stringify(body),
    signal,
  });

  if (!llmRes.ok) {
    const errorText = await llmRes.text().catch(() => '');
    throw new Error(`LLM request failed (${llmRes.status}): ${errorText}`);
  }

  const reader = llmRes.body?.getReader();
  if (!reader) throw new Error('No response body');

  let fullContent = '';
  let finishReason = '';
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;
      try {
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          onChunk?.(delta, fullContent);
        }
        const fr = chunk.choices?.[0]?.finish_reason;
        if (fr) finishReason = fr;
      } catch {
        // 忽略无法解析的行(如 keep-alive)
      }
    }
  }

  return { fullContent, finishReason };
}
