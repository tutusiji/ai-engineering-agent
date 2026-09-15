// packages/agent-runtime/src/skills/ppt-content-polish.ts
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import type { SkillContext, SkillDefinition, SkillPrompt } from '@ai-engineering-agent/skill-sdk';
import { getSlideBudget } from '@ai-engineering-agent/pptx-core';
import type { PptLayoutDensity, PptPageType } from '@ai-engineering-agent/pptx-core';

/** 文字美化 skill — 大纲逐页短句化 + 金句提炼 + 演讲备注，输出 ppt-content */
export const pptContentPolishSkill: SkillDefinition = {
  name: 'ppt-content-polish',
  version: '0.1.0',
  description: '按字数预算美化大纲文案（短句化、金句、演讲备注）',
  inputSchema: { name: 'ppt-outline' },
  outputSchema: { name: 'ppt-content' },
  defaultModel: { model: 'auto', temperature: 0.4 },
  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const outline = (input.outline ?? input) as Record<string, unknown>;
    const theme = (input.theme ?? {}) as Record<string, unknown>;
    const density = String(theme.layoutDensity ?? 'standard') as PptLayoutDensity;
    const types: PptPageType[] = ['cover', 'toc', 'section', 'content-bullets', 'content-two-col', 'quote', 'ending'];
    const budgetLines = types.map((t) => {
      const b = getSlideBudget(t, density);
      return `- ${t}: 标题≤${b.titleMax}字, 要点≤${b.bulletCount}条, 单条≤${b.bulletChars}字`;
    });
    return {
      system: `你是资深 PPT 文案。把大纲改写为适合演讲的最终文案 JSON：

{ "deckTitle": "...", "slides": [{ "pageNo": 1, "pageType": "...", "title": "原大纲标题", "polishedTitle": "≤12字短句标题", "polishedBullets": ["..."], "hookLine": "金句或数字", "notes": "口语化演讲备注" }] }
要求：

- 标题短句化（≤12字，动词开头优先）；bullets 名词短语优先、去虚词
- 每页提炼一条 hookLine（金句或关键数字）；cover/ending 页可省
- 生成口语化演讲备注（notes），每页 1-2 句
- 数字/专有名词保真：与大纲逐字比对，不得改动数值与专名
- 严格按字数预算（同大纲 skill 的预算表）：
${budgetLines.join('\n')}
- 只输出 JSON，不要有其他文字`,
      user: `大纲：
  ${JSON.stringify(outline)}
主题：${JSON.stringify(theme)}`,
    };
  },
  async normalize(raw: JsonObject): Promise<JsonObject> {
    // 结构兜底：字段补全与数组归一化（fitting 预算比对由 pptx-builder 的 computeFitting 承担）
    const slides = Array.isArray(raw.slides) ? raw.slides : [];
    const normalized = slides.map((s, i) => {
      const obj = (s ?? {}) as Record<string, unknown>;
      return {
        pageNo: i + 1,
        pageType: String(obj.pageType ?? 'content-bullets'),
        title: String(obj.title ?? ''),
        polishedTitle: String(obj.polishedTitle ?? obj.title ?? ''),
        bullets: Array.isArray(obj.bullets) ? obj.bullets.map(String) : [],
        polishedBullets: Array.isArray(obj.polishedBullets) ? obj.polishedBullets.map(String) : [],
        // 可选字段：缺省时不产出该键（JsonObject 的值类型 JsonValue 不接受 undefined）
        ...(obj.hookLine === undefined ? {} : { hookLine: String(obj.hookLine) }),
        ...(obj.notes === undefined ? {} : { notes: String(obj.notes) }),
      };
    });
    return {
      deckTitle: String(raw.deckTitle ?? '未命名演示'),
      // 可选字段：缺省时不产出该键（JsonObject 的值类型 JsonValue 不接受 undefined）
      ...(raw.subtitle === undefined ? {} : { subtitle: String(raw.subtitle) }),
      audience: String(raw.audience ?? ''),
      slides: normalized,
    };
  },
};
