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

import type { JsonObject } from '../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../skill-sdk/src';
import { chatCompletion, type LlmConfig, type LlmCallResult } from './llm-client';

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
  llmConfig: LlmConfig,
): Promise<AgentRunResult> {
  try {
    // 1. Build prompt
    const prompt: SkillPrompt = await skill.buildPrompt(ctx, input);

    // 2. Call LLM — merge skill's defaultModel with global config
    const mergedConfig: LlmConfig = {
      ...llmConfig,
      ...(skill.defaultModel?.temperature != null && { temperature: skill.defaultModel.temperature }),
      ...(skill.defaultModel?.maxTokens != null && { maxTokens: skill.defaultModel.maxTokens }),
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

  // Try extracting from ```html ... ``` fences (for design generation)
  const htmlFenced = text.match(/```html\s*\n?([\s\S]*?)```/);
  if (htmlFenced?.[1]) {
    const htmlContent = htmlFenced[1].trim();
    if (htmlContent.length > 100) {
      return {
        pageName: 'design-mockup',
        targetProfile: 'vue3-admin',
        generatedFiles: [{
          path: 'artifacts/design-mockup.html',
          kind: 'page',
          status: 'generated',
          content: htmlContent,
        }],
        patches: [{
          target: 'artifacts/design-mockup.html',
          action: 'create',
          summary: 'HTML 设计稿',
        }],
        notes: ['从 HTML 代码块提取'],
      };
    }
  }

  // Try incomplete HTML fence (truncated before closing ```)
  const incompleteHtmlFence = text.match(/```html\s*\n?([\s\S]+)/);
  if (incompleteHtmlFence?.[1]) {
    const htmlContent = incompleteHtmlFence[1].trim();
    if (htmlContent.length > 100) {
      return {
        pageName: 'design-mockup',
        targetProfile: 'vue3-admin',
        generatedFiles: [{
          path: 'artifacts/design-mockup.html',
          kind: 'page',
          status: 'generated',
          content: htmlContent,
        }],
        patches: [{
          target: 'artifacts/design-mockup.html',
          action: 'create',
          summary: 'HTML 设计稿（截断）',
        }],
        notes: ['从截断的 HTML 代码块提取'],
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
