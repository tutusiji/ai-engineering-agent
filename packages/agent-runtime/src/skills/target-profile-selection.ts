/**
 * Skill: target-profile-selection
 *
 * Takes a RequirementSpec and available target profiles, then selects
 * the most appropriate one with reasoning.
 */

import type { JsonObject } from '../../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../../skill-sdk/src';

export const targetProfileSelectionSkill: SkillDefinition = {
  name: 'target-profile-selection',
  version: '0.1.0',
  description: '根据需求规格选择最合适的目标 profile',
  inputSchema: { name: 'requirement-spec' },
  outputSchema: { name: 'target-profile-selection' },
  defaultModel: {
    model: 'auto',
    temperature: 0.1,
  },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const availableProfiles = await getAvailableProfiles(ctx);

    return {
      system: `你是一个全栈架构决策专家。根据需求规格选择最合适的技术栈（综合考虑前端、后端、数据库和部署方案）。

${availableProfiles ? `可用的预设 target profiles（可选参考）:\n${availableProfiles}\n\n如果预设 profile 与需求匹配，优先选择；如果所有预设都不合适，或者你收到的 profile 列表为空，你可以根据需求独立决策。` : '没有可用的预设 profile。请根据需求特征独立做出全栈技术选型决策。'}

你必须输出一个合法的 JSON 对象，格式如下：
{
  "profileId": "选择的 profile id（如果没有合适的预设则填 'custom' 或根据需求自创一个描述性 id）",
  "platform": "fullstack | admin-web | pc-spa | h5-spa | miniapp | api-server | custom",
  "framework": "vue3 | react | svelte | solid | angular | native-miniapp | custom",
  "uiLibrary": "使用的 UI 库名称（如 element-plus, antd, shadcn/ui 等）",
  "routingMode": "vue-router | react-router | miniapp-pages | custom | none",
  "styling": ["样式方案1"],
  "backend": { "framework": "nestjs | fastapi | gin | express | spring-boot", "language": "typescript | python | go | java", "orm": "prisma | sqlalchemy | gorm | typeorm", "database": "postgresql | mysql | mongodb | sqlite" },
  "reasons": ["选择理由1", "选择理由2"]
}

要求：
- 优先匹配需求中明确提到的技术栈
- 根据需求特点推断最合适的全栈方案：考虑并发量、数据结构、实时性、团队学习曲线
- 管理后台类需求默认选成熟的组合（如 vue3+element-plus+nestjs+postgresql）
- 移动端/小程序需求选对应的前端方案
- 高并发/实时需求考虑 go/rust 后端
- 前端和后端技术选型要自洽（不要出现 react 配 pinia 这种错误）
- 只输出 JSON，不要有其他文字`,

      user: `需求规格:
${JSON.stringify(input, null, 2)}`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    return {
      profileId: String(raw.profileId ?? 'custom'),
      platform: String(raw.platform ?? 'admin-web'),
      framework: String(raw.framework ?? 'vue3'),
      uiLibrary: String(raw.uiLibrary ?? ''),
      routingMode: String(raw.routingMode ?? 'vue-router'),
      styling: Array.isArray(raw.styling) ? raw.styling : [],
      reasons: Array.isArray(raw.reasons) ? raw.reasons : [],
    };
  },
};

async function getAvailableProfiles(ctx: SkillContext): Promise<string> {
  const lines: string[] = [];

  // Try dynamic discovery first (reads from policies/targets/ directory)
  if (ctx.policies.listTargetProfiles) {
    try {
      const ids = await ctx.policies.listTargetProfiles();
      for (const id of ids) {
        try {
          const policy = await ctx.policies.get(id);
          if (policy) {
            lines.push(`- ${id}: platform=${String(policy.platform ?? '?')}, framework=${String(policy.framework ?? '?')}, uiLibrary=${String(policy.uiLibrary ?? '?')}, backend=${String((policy.backend as Record<string, unknown>)?.framework ?? '?')}`);
          } else {
            lines.push(`- ${id}`);
          }
        } catch {
          lines.push(`- ${id}`);
        }
      }
      if (lines.length > 0) return lines.join('\n');
    } catch {
      // fall through to hardcoded fallback
    }
  }

  // Hardcoded fallback for backward compatibility
  const fallbackIds = ['fullstack-vue3-nestjs', 'fullstack-react-nestjs', 'vue3-admin', 'react-admin', 'pc-spa', 'h5-spa', 'wechat-miniapp'];
  for (const id of fallbackIds) {
    try {
      const policy = await ctx.policies.get(id);
      if (policy) {
        lines.push(`- ${id}: platform=${String(policy.platform ?? '?')}, framework=${String(policy.framework ?? '?')}, uiLibrary=${String(policy.uiLibrary ?? '?')}`);
      } else {
        lines.push(`- ${id}`);
      }
    } catch {
      lines.push(`- ${id}`);
    }
  }

  return lines.join('\n');
}
