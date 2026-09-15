// packages/agent-runtime/src/skills/ppt-outline-planning.ts
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import type { SkillContext, SkillDefinition, SkillPrompt } from '@ai-engineering-agent/skill-sdk';
import { getSlideBudget } from '@ai-engineering-agent/pptx-core';
import type { PptPageType, PptLayoutDensity } from '@ai-engineering-agent/pptx-core';

/** 组装大纲规划 skill — 输入素材 + 主题 + 偏好，输出 ppt-outline 结构 */
export const pptOutlinePlanningSkill: SkillDefinition = {
  name: 'ppt-outline-planning',
  version: '0.1.0',
  description: '从归一化素材提炼 PPT 大纲（金字塔结构，按主题密度分配内容）',
  inputSchema: { name: 'ppt-source' },
  outputSchema: { name: 'ppt-outline' },
  defaultModel: { model: 'auto', temperature: 0.3 },
  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    // 主题与偏好从工作流输入中解出
    const theme = (input.theme ?? {}) as Record<string, unknown>;
    const prefs = (input.preferences ?? {}) as Record<string, unknown>;
    const density = String(theme.layoutDensity ?? 'standard') as PptLayoutDensity;
    const types: PptPageType[] = ['cover', 'toc', 'section', 'content-bullets', 'content-two-col', 'quote', 'ending'];
    // 生成字数预算说明表（与 buildPptx 同源）
    const budgetLines = types.map((t) => {
      const b = getSlideBudget(t, density);
      return `- ${t}: 标题≤${b.titleMax}字, 要点≤${b.bulletCount}条, 单条≤${b.bulletChars}字`;
    });
    // 大纲反馈修订：携带 feedback + previousOutline 时，在 user 提示中切换为修订模式
    const feedback = typeof input.feedback === 'string' ? input.feedback : '';
    const previousOutline = input.previousOutline;
    return {
      system: `你是一位资深 PPT 策划专家。根据素材与受众，产出结构化 PPT 大纲 JSON。
你必须输出一个合法的 JSON 对象，格式如下：
{
  "deckTitle": "string（演示文稿标题）",
  "subtitle": "string（副标题，可选）",
  "audience": "string（受众）",
  "totalPages": number,
  "slides": [{ "pageNo": 1, "pageType": "cover|toc|section|content-bullets|content-two-col|quote|ending", "title": "string", "bullets": ["..."], "notes": "string（可省）" }]
}
要求：
- 金字塔原理叙事：结论先行，cover → toc → section → content → ending 序列
- 严格按下面的字数预算分配内容，不得超出：
${budgetLines.join('\n')}
- 忠实素材：只重组不臆造，素材中没有的数字不得编造
- 受众适配：向上汇报突出结论与数据；团队分享突出过程与细节
- 目标页数约 ${prefs.targetPages ?? 12} 页；受众以素材 meta 与 preferences 为准
- 只输出 JSON，不要有其他文字`,
      user: `素材：
${input.markdown ?? (input.source as Record<string, unknown> | undefined)?.markdown ?? ''}
主题：${JSON.stringify(theme)}
偏好：${JSON.stringify(prefs)}${
        feedback && previousOutline
          ? `

## 反馈修订
这是对已有大纲的修订重跑，请输出修订后的完整大纲（同样遵守字数预算）。
用户反馈：${feedback}
原大纲 JSON：
${JSON.stringify(previousOutline)}`
          : ''
      }`,
    };
  },
  async normalize(raw: JsonObject): Promise<JsonObject> {
    // 结构兜底：slides 数组校验、pageType 枚举兜底、pageNo 重排、totalPages 收敛
    const slides = Array.isArray(raw.slides) ? raw.slides : [];
    const VALID = ['cover', 'toc', 'section', 'content-bullets', 'content-two-col', 'quote', 'ending'];
    const normalized = slides.map((s, i) => {
      const obj = (s ?? {}) as Record<string, unknown>;
      // pageType 枚举兜底：合法值原样保留；缺省/非法时，首页推断为 cover（大纲约定序列以封面开始），其余回落 content-bullets
      const pageType = VALID.includes(String(obj.pageType))
        ? String(obj.pageType)
        : i === 0
          ? 'cover'
          : 'content-bullets';
      return {
        pageNo: i + 1,
        pageType,
        title: String(obj.title ?? ''),
        bullets: Array.isArray(obj.bullets) ? obj.bullets.map(String) : [],
        // 可选字段：缺省时不产出该键（JsonObject 的值类型 JsonValue 不接受 undefined）
        ...(obj.notes === undefined ? {} : { notes: String(obj.notes) }),
      };
    });
    return {
      deckTitle: String(raw.deckTitle ?? '未命名演示'),
      // 可选字段：缺省时不产出该键（JsonObject 的值类型 JsonValue 不接受 undefined）
      ...(raw.subtitle === undefined ? {} : { subtitle: String(raw.subtitle) }),
      audience: String(raw.audience ?? ''),
      totalPages: normalized.length,
      slides: normalized,
    };
  },
};
