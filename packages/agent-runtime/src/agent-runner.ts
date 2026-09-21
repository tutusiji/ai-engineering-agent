/**
 * Agent Runner — bridges SkillDefinition with an LLM.
 *
 * Flow:
 *   1. Receive a SkillDefinition + SkillContext + input
 *   2. Call skill.buildPrompt() to get system/user prompts
 *   3. Send to LLM via chatCompletion()
 *   4. Extract JSON from the response
 *   5. Run skill.normalize() if available
 *   6. Return structured output
 */

import type { JsonObject } from '@ai-engineering-agent/shared-types';
import type { SkillContext, SkillDefinition, SkillPrompt } from '@ai-engineering-agent/skill-sdk';
import { chatCompletion, resolveProviderConfig, type LlmConfig, type LlmCallResult } from './llm-client';

export interface AgentRunResult {
  ok: boolean;
  output?: JsonObject;
  raw?: string;
  usage?: LlmCallResult['usage'];
  model?: string;
  error?: string;
}

/**
 * Execute a skill through the LLM.
 */
export async function runSkillThroughLlm(
  skill: SkillDefinition,
  ctx: SkillContext,
  input: JsonObject,
  llmConfig: LlmConfig
): Promise<AgentRunResult> {
  try {
    // 1. Build prompt
    const prompt: SkillPrompt = await skill.buildPrompt(ctx, input);

    // 2. Call LLM — merge skill's defaultModel 路由：
    // model='auto' → 直接用全局 config；model=具体模型名 → 先查 provider 表切换 config 基底
    // （baseUrl/apiKey/model 整体切换，支持重任务 skill 显式路由到其他 provider，如
    // ark-code-latest 实际为 GLM 推理模型、架构/设计重任务 5 分钟内无法完成）。
    // 查无命中保持默认 config 基底（模型名仍写入 merged config，由上游端点拒绝并给出明确错误）
    const base =
      skill.defaultModel?.model && skill.defaultModel.model !== 'auto'
        ? (resolveProviderConfig(skill.defaultModel.model) ?? llmConfig)
        : llmConfig;
    const mergedConfig: LlmConfig = {
      ...base,
      ...(skill.defaultModel?.temperature != null && { temperature: skill.defaultModel.temperature }),
      ...(skill.defaultModel?.maxTokens != null && { maxTokens: skill.defaultModel.maxTokens }),
      ...(skill.defaultModel?.timeoutMs != null && { timeoutMs: skill.defaultModel.timeoutMs }),
      ...(skill.defaultModel?.model && skill.defaultModel.model !== 'auto' && { model: skill.defaultModel.model }),
      ...(skill.defaultModel?.thinking && { thinking: skill.defaultModel.thinking }),
    };

    const messages = [
      { role: 'system' as const, content: prompt.system },
      { role: 'user' as const, content: buildUserContent(prompt) },
    ];

    const result = await chatCompletion(mergedConfig, messages);

    // 3. Extract JSON
    const parsed = extractJson(result.content);
    if (!parsed) {
      return {
        ok: false,
        raw: result.content,
        error: 'LLM response did not contain valid JSON',
        usage: result.usage,
        model: result.model,
      };
    }

    // 4. Normalize if the skill provides it
    let output = parsed;
    if (skill.normalize) {
      output = await skill.normalize(parsed);
    }

    return {
      ok: true,
      output,
      raw: result.content,
      usage: result.usage,
      model: result.model,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Build the user-facing content string from a SkillPrompt.
 */
function buildUserContent(prompt: SkillPrompt): string {
  let content = prompt.user;

  if (prompt.attachments?.length) {
    for (const attachment of prompt.attachments) {
      content += `\n\n--- ${attachment.kind} ---\n${attachment.content}`;
    }
  }

  return content;
}

/**
 * Extract JSON from LLM response.
 * Handles: raw JSON, JSON in markdown code fences, mixed text + JSON.
 */
export function extractJson(text: string): JsonObject | null {
  // Try parsing the whole thing first
  const direct = tryParse(text);
  if (direct) return direct;

  // Try extracting from ```json ... ``` fences
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1].trim());
    if (parsed) return parsed;
    // Fence content might be truncated — try repair
    const repairedFenced = tryRepairJson(fenced[1].trim());
    if (repairedFenced) return repairedFenced;
  }

  // Try extracting from ```html ... ``` fences (for preview generation)
  const htmlFenced = text.match(/```html\s*\n?([\s\S]*?)```/);
  if (htmlFenced?.[1]) {
    const htmlContent = htmlFenced[1].trim();
    if (htmlContent.length > 100) {
      return {
        pageName: 'fullstack-preview',
        targetProfile: 'fullstack-vue3-nestjs',
        generatedFiles: [
          {
            path: 'artifacts/fullstack-preview.html',
            kind: 'page',
            status: 'generated',
            content: htmlContent,
          },
        ],
        patches: [
          {
            target: 'artifacts/fullstack-preview.html',
            action: 'create',
            summary: '全栈预览页',
          },
        ],
        notes: ['从 HTML 代码块提取预览页'],
      };
    }
  }

  // Try incomplete HTML fence (truncated before closing ```)
  const incompleteHtmlFence = text.match(/```html\s*\n?([\s\S]+)/);
  if (incompleteHtmlFence?.[1]) {
    const htmlContent = incompleteHtmlFence[1].trim();
    if (htmlContent.length > 100) {
      return {
        pageName: 'fullstack-preview',
        targetProfile: 'fullstack-vue3-nestjs',
        generatedFiles: [
          {
            path: 'artifacts/fullstack-preview.html',
            kind: 'page',
            status: 'generated',
            content: htmlContent,
          },
        ],
        patches: [
          {
            target: 'artifacts/fullstack-preview.html',
            action: 'create',
            summary: '全栈预览页（截断）',
          },
        ],
        notes: ['从截断的 HTML 代码块提取预览页'],
      };
    }
  }

  // Try incomplete fence (truncated before closing ```)
  const incompleteFence = text.match(/```(?:json)?\s*\n?([\s\S]+)/);
  if (incompleteFence?.[1]) {
    const repaired = tryRepairJson(incompleteFence[1].trim());
    if (repaired) return repaired;
  }

  // Try finding the first { ... } block
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    const parsed = tryParse(braceMatch[0]);
    if (parsed) return parsed;
  }

  // 裸 HTML 兜底 — 响应整体是 HTML（无 fence）或 JSON 包裹 HTML 但内部转义非法
  // （模型把 HTML 换行/引号原样写进 JSON 字符串，JSON.parse 与修复均失败）时，
  // 从 <!DOCTYPE html / <html 起提取整段 HTML 作为预览页产物
  const htmlStart = text.search(/<!DOCTYPE html|<html[\s>]/i);
  if (htmlStart !== -1) {
    let htmlContent = text.slice(htmlStart).trim();
    // 截到 </html> 为止，丢弃 JSON 包裹残尾
    const htmlEndIdx = htmlContent.toLowerCase().lastIndexOf('</html>');
    if (htmlEndIdx !== -1) htmlContent = htmlContent.slice(0, htmlEndIdx + 7);
    if (htmlContent.length > 100) {
      return {
        pageName: 'fullstack-preview',
        targetProfile: 'fullstack-vue3-nestjs',
        generatedFiles: [
          {
            path: 'artifacts/fullstack-preview.html',
            kind: 'page',
            status: 'generated',
            content: htmlContent,
          },
        ],
        patches: [
          {
            target: 'artifacts/fullstack-preview.html',
            action: 'create',
            summary: '全栈预览页（裸 HTML 提取）',
          },
        ],
        notes: ['从裸 HTML 响应提取预览页'],
      };
    }
  }

  // Last resort: try to repair truncated JSON
  const repaired = tryRepairJson(text);
  if (repaired) return repaired;

  return null;
}

function tryParse(text: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Attempt to repair a truncated JSON string (e.g. from LLM token limit).
 * Strategy: strip trailing partial values, close open brackets.
 */
function tryRepairJson(text: string): JsonObject | null {
  let s = text.trimEnd();

  // 1. If inside a string, close it (find last unescaped ")
  const openQuoteIdx = findLastUnclosedQuote(s);
  if (openQuoteIdx !== -1) {
    s = s.slice(0, openQuoteIdx);
  }

  // 2. Remove trailing comma (possibly with whitespace/newlines)
  s = s.replace(/,(\s*)$/, '$1');

  // 3. Close all open [ and { (track depth)
  const openBrackets: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      // Skip string content
      const end = findClosingQuote(s, i + 1);
      if (end !== -1) i = end;
    } else if (ch === '{') {
      openBrackets.push('}');
    } else if (ch === '[') {
      openBrackets.push(']');
    } else if (ch === '}' || ch === ']') {
      openBrackets.pop();
    }
  }
  // Close in reverse order
  while (openBrackets.length > 0) {
    s += openBrackets.pop();
  }

  // 4. Try parsing
  return tryParse(s);
}

/** Find the closing quote for a string starting at pos (after opening quote). */
function findClosingQuote(s: string, start: number): number {
  for (let i = start; i < s.length; i++) {
    if (s[i] === '\\') {
      i++; // skip escaped char
    } else if (s[i] === '"') {
      return i;
    }
  }
  return -1;
}

/** Find the position of the last unclosed " in the string. */
function findLastUnclosedQuote(s: string): number {
  let lastQuote = -1;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') {
      if (!inString) {
        inString = true;
        lastQuote = i;
      } else {
        // Check if escaped
        let backslashes = 0;
        for (let j = i - 1; j >= 0 && s[j] === '\\'; j--) backslashes++;
        if (backslashes % 2 === 0) {
          inString = false;
        }
      }
    }
  }
  return inString ? lastQuote : -1;
}
