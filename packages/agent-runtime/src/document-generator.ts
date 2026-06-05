/**
 * Document Generator
 *
 * Functions for generating, optimizing, and merging structured requirement documents.
 * Used by the Studio API endpoints.
 */

import type { LlmConfig } from './llm-client';
import { chatCompletion } from './llm-client';

// ─── Types ─────────────────────────────────────────────────────────────

/** Module names that can be individually optimized */
export type DocumentModule =
  | 'featureName'
  | 'businessGoal'
  | 'userRoles'
  | 'uiLibrary'
  | 'pages'
  | 'entities'
  | 'businessRules'
  | 'edgeCases'
  | 'nonFunctional'
  | 'phases';

// ─── Generate Full Document ────────────────────────────────────────────

/**
 * Generate a complete structured requirement document from conversation history.
 * Sends all conversation text + current doc to LLM, returns a full document.
 */
export async function generateFullDocument(
  config: LlmConfig,
  conversationText: string,
  currentDoc: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const currentSummary = currentDoc && Object.keys(currentDoc).length > 0
    ? `\n当前已有文档：\n${JSON.stringify(currentDoc, null, 2).slice(0, 2000)}`
    : '';

  const prompt = [
    {
      role: 'system' as const,
      content: `你是一个需求文档生成器。根据用户与 AI 的对话历史，生成一份完整的结构化前端需求文档。

${currentSummary}

输出一个 JSON 对象，包含以下字段：
{
  "featureName": "功能名称",
  "businessGoal": "业务目标和背景描述",
  "techStack": "技术栈",
  "userRoles": [{"name": "角色名", "description": "描述", "permissions": ["权限"]}],
  "uiLibrary": {"id": "库ID", "name": "库名称", "npmPackage": "包名"},
  "pages": [{"name": "页面名", "goal": "目标", "pageType": "类型", "sections": ["区域"], "actions": ["操作"], "fields": [{"name": "字段", "type": "类型", "required": true, "description": "描述"}], "interactions": ["交互"]}],
  "entities": [{"name": "实体名", "fields": [{"name": "字段", "type": "类型", "required": true}]}],
  "businessRules": ["业务规则"],
  "edgeCases": ["边界情况"],
  "nonFunctional": ["非功能需求"],
  "phases": [{"id": "P1", "name": "阶段名", "pages": ["页面"], "priority": "high/medium/low"}],
  "completeness": 0-100,
  "openQuestions": ["待确认问题"],
  "suggestedNextStep": "continue-gathering/generate-design/start-coding"
}

规则：
- completeness 基于已有信息的完整度评估（0-100）
- openQuestions 列出对话中尚未明确的点
- 只输出 JSON，不要其他文字`,
    },
    {
      role: 'user' as const,
      content: `以下是完整的对话历史，请据此生成需求文档：\n\n${conversationText}`,
    },
  ];

  const result = await chatCompletion(
    { ...config, maxTokens: 16384 },
    prompt,
  );

  return parseJsonFromResponse(result.content);
}

// ─── Optimize Single Module ────────────────────────────────────────────

/**
 * Optimize a single module of the requirement document.
 * Only the specified module is updated; everything else stays the same.
 */
export async function optimizeModule(
  config: LlmConfig,
  moduleName: string,
  currentValue: unknown,
  instruction: string,
  fullDoc: Record<string, unknown>,
): Promise<unknown> {
  // Build a compact context of other modules
  const otherContext: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fullDoc)) {
    if (k !== moduleName && k !== 'completeness' && k !== 'openQuestions' && k !== 'suggestedNextStep') {
      otherContext[k] = v;
    }
  }

  const prompt = [
    {
      role: 'system' as const,
      content: `你是一个需求文档优化器。用户想要优化文档中的「${moduleName}」模块。

其他模块的上下文（仅供参考，不要修改）：
${JSON.stringify(otherContext, null, 2).slice(0, 3000)}

当前「${moduleName}」的内容：
${JSON.stringify(currentValue, null, 2)}

用户的优化指令：${instruction}

规则：
- 只输出「${moduleName}」模块的新值（JSON 格式）
- 保留已有内容，在此基础上根据用户指令增删改
- 不要输出其他模块的内容
- 只输出 JSON，不要其他文字`,
    },
    {
      role: 'user' as const,
      content: instruction,
    },
  ];

  const result = await chatCompletion(
    { ...config, maxTokens: 8192 },
    prompt,
  );

  return parseJsonFromResponse(result.content);
}

// ─── Deep Merge ────────────────────────────────────────────────────────

/**
 * Deep merge two documents. Strategy:
 * - String fields: overwrite if new value is longer (more detailed)
 * - Array of objects (pages/entities/userRoles): merge by 'name' field
 * - Array of strings (businessRules/etc): append unique values
 * - completeness: take the higher value
 */
export function mergeDocumentDeep(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...current };

  for (const [key, newVal] of Object.entries(incoming)) {
    if (key === 'completeness' || key === 'suggestedNextStep') {
      // These are computed, skip for now
      continue;
    }

    const oldVal = merged[key];

    if (newVal === undefined || newVal === null) continue;

    // String fields: update if new is longer
    if (typeof newVal === 'string') {
      if (!oldVal || typeof oldVal !== 'string' || newVal.length > oldVal.length) {
        merged[key] = newVal;
      }
      continue;
    }

    // Array fields
    if (Array.isArray(newVal)) {
      const oldArr = Array.isArray(oldVal) ? oldVal as unknown[] : [];

      // Arrays of objects with 'name' (pages, entities, userRoles, phases)
      if (newVal.length > 0 && typeof newVal[0] === 'object' && newVal[0] !== null && 'name' in (newVal[0] as Record<string, unknown>)) {
        merged[key] = mergeArrayByName(
          oldArr as Record<string, unknown>[],
          newVal as Record<string, unknown>[],
        );
      } else {
        // Arrays of strings (businessRules, edgeCases, nonFunctional)
        const existing = new Set(oldArr.map(v => JSON.stringify(v)));
        const appended = [...oldArr];
        for (const item of newVal) {
          const key = JSON.stringify(item);
          if (!existing.has(key)) {
            appended.push(item);
            existing.add(key);
          }
        }
        merged[key] = appended;
      }
      continue;
    }

    // Object fields (uiLibrary): overwrite
    if (typeof newVal === 'object') {
      merged[key] = { ...(oldVal as Record<string, unknown> ?? {}), ...newVal };
      continue;
    }

    // Numbers, booleans: overwrite
    merged[key] = newVal;
  }

  // Compute completeness
  const completeness = estimateCompleteness(merged);
  merged.completeness = completeness;

  // Set suggestedNextStep
  if (completeness >= 95) {
    merged.suggestedNextStep = 'start-coding';
  } else if (completeness >= 80) {
    merged.suggestedNextStep = 'generate-design';
  } else {
    merged.suggestedNextStep = 'continue-gathering';
  }

  return merged;
}

// ─── Estimate Completeness ─────────────────────────────────────────────

/**
 * Estimate document completeness based on which fields are filled.
 */
export function estimateCompleteness(doc: Record<string, unknown>): number {
  let score = 0;

  if (doc.featureName && String(doc.featureName).length > 2) score += 10;
  if (doc.businessGoal && String(doc.businessGoal).length > 10) score += 10;
  if (doc.techStack) score += 5;
  if (doc.uiLibrary) score += 5;

  const userRoles = Array.isArray(doc.userRoles) ? doc.userRoles : [];
  if (userRoles.length > 0) score += 10;

  const pages = Array.isArray(doc.pages) ? doc.pages : [];
  if (pages.length > 0) score += 15;
  if (pages.length >= 3) score += 5;

  const entities = Array.isArray(doc.entities) ? doc.entities : [];
  if (entities.length > 0) score += 10;

  const rules = Array.isArray(doc.businessRules) ? doc.businessRules : [];
  if (rules.length > 0) score += 10;

  const edgeCases = Array.isArray(doc.edgeCases) ? doc.edgeCases : [];
  if (edgeCases.length > 0) score += 5;

  const nonFunc = Array.isArray(doc.nonFunctional) ? doc.nonFunctional : [];
  if (nonFunc.length > 0) score += 5;

  const questions = Array.isArray(doc.openQuestions) ? doc.openQuestions : [];
  if (questions.length === 0) score += 10;

  return Math.min(100, score);
}

// ─── Helpers ───────────────────────────────────────────────────────────

function mergeArrayByName(
  existing: Record<string, unknown>[],
  incoming: Record<string, unknown>[],
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of existing) {
    map.set(String(item.name ?? ''), item);
  }
  for (const item of incoming) {
    const name = String(item.name ?? '');
    const prev = map.get(name);
    map.set(name, prev ? { ...prev, ...item } : item);
  }
  return Array.from(map.values());
}

function parseJsonFromResponse(content: string): Record<string, unknown> {
  // Try to find JSON in the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in LLM response');
  }

  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    // Try to fix common JSON issues (trailing commas, unclosed brackets)
    let text = jsonMatch[0];
    text = text.replace(/,\s*([\]}])/g, '$1'); // remove trailing commas

    // Try to close unclosed brackets
    const openBraces = (text.match(/\{/g) || []).length;
    const closeBraces = (text.match(/\}/g) || []).length;
    const openBrackets = (text.match(/\[/g) || []).length;
    const closeBrackets = (text.match(/\]/g) || []).length;

    for (let i = 0; i < openBrackets - closeBrackets; i++) text += ']';
    for (let i = 0; i < openBraces - closeBraces; i++) text += '}';

    return JSON.parse(text) as Record<string, unknown>;
  }
}
