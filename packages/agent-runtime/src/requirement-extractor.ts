/**
 * Requirement Info Extractor
 *
 * Lightweight LLM call to extract structured requirement info
 * from a conversation. Called after each chat turn.
 */

import type { LlmConfig } from './llm-client';
import { chatCompletion } from './llm-client';

/** Extracted info from a conversation turn */
export interface ExtractedInfo {
  /** What was discussed/confirmed */
  confirmed: Record<string, unknown>;
  /** New open questions identified */
  newQuestions?: string[];
  /** Questions that were answered (can be removed) */
  answeredQuestions?: string[];
  /** Completeness estimate 0-100 */
  completeness?: number;
}

/**
 * Extract structured requirement info from conversation.
 * Uses a lightweight prompt to minimize token usage.
 */
export async function extractRequirementInfo(
  config: LlmConfig,
  conversationSummary: string,
  currentDoc: Record<string, unknown>,
): Promise<ExtractedInfo | null> {
  const currentDocSummary = summarizeDoc(currentDoc);

  const prompt = [
    {
      role: 'system' as const,
      content: `你是一个需求信息提取器。从对话中提取新确认的全栈需求信息（包括前端页面、后端API、数据库实体等）。

当前需求文档摘要：
${currentDocSummary || '（空文档）'}

输出一个 JSON 对象，只包含新确认的信息（不要重复已有信息）：
{
  "confirmed": {
    "featureName": "如果本次确认了功能名称",
    "businessGoal": "如果本次确认了业务目标",
    "techStack": "如果本次确认了技术栈",
    "uiLibrary": "如果本次确认了UI库",
    "pages": [{"name": "页面名", "goal": "目标", "pageType": "类型"}],
    "entities": [{"name": "实体名", "fields": [{"name": "字段", "type": "类型"}]}],
    "businessRules": ["新确认的规则"],
    "userRoles": [{"name": "角色", "description": "描述"}],
    "nonFunctional": ["非功能需求"]
  },
  "answeredQuestions": ["本次回答了哪些之前待确认的问题"],
  "newQuestions": ["本次对话中新发现的待确认问题"],
  "completeness": 50
}

规则：
- confirmed 中只放本次新确认的信息，不要重复已有内容
- 如果本次只是追问没有新确认信息，confirmed 为空对象
- completeness 基于整体信息完整度评估
- 只输出 JSON，不要其他文字`,
    },
    {
      role: 'user' as const,
      content: `最近对话：\n${conversationSummary}`,
    },
  ];

  try {
    const result = await chatCompletion(
      { ...config, maxTokens: 8192 },
      prompt,
    );

    console.log(`🔍 [extractor] LLM response length: ${result.content.length}`);
    console.log(`🔍 [extractor] LLM response preview: ${result.content.slice(0, 200)}`);

    // Extract JSON from response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`⚠️ [extractor] No JSON found in response`);
      return null;
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as ExtractedInfo;
      return {
        confirmed: parsed.confirmed ?? {},
        newQuestions: Array.isArray(parsed.newQuestions) ? parsed.newQuestions : [],
        answeredQuestions: Array.isArray(parsed.answeredQuestions) ? parsed.answeredQuestions : [],
        completeness: typeof parsed.completeness === 'number' ? parsed.completeness : undefined,
      };
    } catch (parseErr) {
      console.warn(`⚠️ [extractor] JSON parse failed:`, parseErr instanceof Error ? parseErr.message : parseErr);
      console.warn(`⚠️ [extractor] JSON text: ${jsonMatch[0].slice(0, 300)}`);
      return null;
    }
  } catch (err) {
    console.error(`⚠️ [extractor] chatCompletion failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Merge extracted info into existing document.
 * Only updates fields that have new information.
 */
export function mergeDocument(
  current: Record<string, unknown>,
  extracted: ExtractedInfo,
): Record<string, unknown> {
  const doc = { ...current };
  const c = extracted.confirmed;

  // Simple fields: overwrite if present
  if (c.featureName) doc.featureName = c.featureName;
  if (c.businessGoal) doc.businessGoal = c.businessGoal;
  if (c.techStack) doc.techStack = c.techStack;
  if (c.uiLibrary) doc.uiLibrary = c.uiLibrary;

  // Array fields: merge (avoid duplicates by name)
  if (Array.isArray(c.pages) && c.pages.length > 0) {
    const existing = Array.isArray(doc.pages) ? doc.pages as Record<string, unknown>[] : [];
    const merged = mergeArrayByName(existing, c.pages as Record<string, unknown>[]);
    doc.pages = merged;
  }

  if (Array.isArray(c.entities) && c.entities.length > 0) {
    const existing = Array.isArray(doc.entities) ? doc.entities as Record<string, unknown>[] : [];
    const merged = mergeArrayByName(existing, c.entities as Record<string, unknown>[]);
    doc.entities = merged;
  }

  if (Array.isArray(c.userRoles) && c.userRoles.length > 0) {
    const existing = Array.isArray(doc.userRoles) ? doc.userRoles as Record<string, unknown>[] : [];
    const merged = mergeArrayByName(existing, c.userRoles as Record<string, unknown>[]);
    doc.userRoles = merged;
  }

  // Append-only arrays
  appendUnique(doc, 'businessRules', c.businessRules as unknown[]);
  appendUnique(doc, 'nonFunctional', c.nonFunctional as unknown[]);

  // Update open questions: remove answered, add new
  if (Array.isArray(extracted.answeredQuestions) || Array.isArray(extracted.newQuestions)) {
    let questions = Array.isArray(doc.openQuestions) ? [...doc.openQuestions] as string[] : [];
    
    // Remove answered questions
    if (Array.isArray(extracted.answeredQuestions)) {
      questions = questions.filter(q => !extracted.answeredQuestions!.includes(q));
    }
    
    // Add new questions (avoid duplicates)
    if (Array.isArray(extracted.newQuestions)) {
      for (const q of extracted.newQuestions) {
        if (!questions.includes(q)) {
          questions.push(q);
        }
      }
    }
    
    doc.openQuestions = questions;
  }

  // Update completeness
  if (typeof extracted.completeness === 'number') {
    doc.completeness = Math.min(100, Math.max(0, extracted.completeness));
  }

  // Set suggested next step based on completeness
  const comp = (doc.completeness as number) ?? 0;
  if (comp >= 95) {
    doc.suggestedNextStep = 'start-coding';
  } else if (comp >= 80) {
    doc.suggestedNextStep = 'generate-preview';
  } else {
    doc.suggestedNextStep = 'continue-gathering';
  }

  return doc;
}

/** Merge two arrays by 'name' field, new items override old */
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

/** Append values to an array field, avoiding duplicates */
function appendUnique(
  doc: Record<string, unknown>,
  field: string,
  values: unknown[] | undefined,
): void {
  if (!Array.isArray(values) || values.length === 0) return;
  const existing = Array.isArray(doc[field]) ? doc[field] as unknown[] : [];
  for (const v of values) {
    if (!existing.includes(v)) {
      existing.push(v);
    }
  }
  doc[field] = existing;
}

/** Create a compact summary of the current document */
function summarizeDoc(doc: Record<string, unknown>): string {
  if (!doc || Object.keys(doc).length === 0) return '';

  const parts: string[] = [];
  if (doc.featureName) parts.push(`功能: ${doc.featureName}`);
  if (doc.businessGoal) parts.push(`目标: ${doc.businessGoal}`);
  if (doc.uiLibrary) parts.push(`UI库: ${typeof doc.uiLibrary === 'object' ? (doc.uiLibrary as Record<string, unknown>).name : doc.uiLibrary}`);
  
  const pages = Array.isArray(doc.pages) ? doc.pages : [];
  if (pages.length > 0) {
    parts.push(`页面(${pages.length}): ${pages.map((p: Record<string, unknown>) => p.name).join(', ')}`);
  }

  const entities = Array.isArray(doc.entities) ? doc.entities : [];
  if (entities.length > 0) {
    parts.push(`实体(${entities.length}): ${entities.map((e: Record<string, unknown>) => e.name).join(', ')}`);
  }

  const rules = Array.isArray(doc.businessRules) ? doc.businessRules : [];
  if (rules.length > 0) parts.push(`规则: ${rules.length}条`);

  const questions = Array.isArray(doc.openQuestions) ? doc.openQuestions : [];
  if (questions.length > 0) parts.push(`待确认: ${questions.length}项`);

  if (doc.completeness !== undefined) parts.push(`完整度: ${doc.completeness}%`);

  return parts.join('\n');
}
