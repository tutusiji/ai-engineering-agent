/**
 * Skill: page-planning
 *
 * Takes a RequirementSpec + TargetProfileSelection and produces a PagePlan
 * with page types, route modes, and component reuse hints.
 */

import type { JsonObject } from '@ai-engineering-agent/shared-types';
import type { SkillContext, SkillDefinition, SkillPrompt } from '@ai-engineering-agent/skill-sdk';

export const pagePlanningSkill: SkillDefinition = {
  name: 'page-planning',
  version: '0.1.0',
  description: '根据需求规格和目标 profile 规划页面结构',
  inputSchema: { name: 'requirement-spec' },
  outputSchema: { name: 'page-plan' },
  defaultModel: {
    model: 'auto',
    temperature: 0.2,
  },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const archTech = (ctx.architectureDesign as JsonObject | undefined)?.techStack as JsonObject | undefined;
    const archFrontend = archTech?.frontend as JsonObject | undefined;
    const framework = String(archFrontend?.framework ?? ctx.targetProfile?.framework ?? 'vue3');
    const targetProfileId = ctx.targetProfile?.id ?? framework;
    const profilePolicy = await loadProfilePolicy(ctx, targetProfileId);

    return {
      system: `你是一个全栈页面规划专家。根据需求规格和目标 profile，规划每个页面的具体结构（包括前端路由和后端 API 端点需求）。

当前目标 profile: ${targetProfileId}
支持的页面模式: ${profilePolicy}

你必须输出一个合法的 JSON 对象，格式如下：
{
  "targetProfile": "${targetProfileId}",
  "pages": [
    {
      "name": "页面名称",
      "pageType": "list | form | detail | dashboard | modal | drawer | tab | wizard",
      "routeMode": "menu-route | child-route | modal | drawer | tab-page | miniapp-page | standalone",
      "reusedComponents": ["可复用的组件1", "可复用的组件2"],
      "dangerActions": ["危险操作1"]
    }
  ]
}

要求：
- pageType 要根据页面的实际用途选择
- routeMode 要参考目标 profile 支持的模式
- reusedComponents 要参考项目中可能存在的通用组件（如 search-panel, table-pagination, form-dialog 等）
- dangerActions 包含所有需要二次确认的操作（如删除、批量操作、状态变更等）
- 列表页通常用 list + menu-route
- 表单页如果是编辑已有数据用 form + child-route，新建用 form + modal 或 drawer
- 只输出 JSON，不要有其他文字`,

      user: `需求规格:
${JSON.stringify(input, null, 2)}`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    return {
      targetProfile: String(raw.targetProfile ?? 'architecture-driven'),
      pages: Array.isArray(raw.pages)
        ? raw.pages.map((page: unknown) => {
            const p = page as Record<string, unknown>;
            return {
              name: String(p.name ?? '未命名页面'),
              pageType: String(p.pageType ?? 'list'),
              routeMode: String(p.routeMode ?? 'menu-route'),
              reusedComponents: Array.isArray(p.reusedComponents) ? p.reusedComponents : [],
              dangerActions: Array.isArray(p.dangerActions) ? p.dangerActions : [],
            };
          })
        : [],
    };
  },
};

async function loadProfilePolicy(ctx: SkillContext, profileId: string): Promise<string> {
  try {
    const policy = await ctx.policies.get(profileId);
    const pagePatterns = policy?.pagePatterns as Record<string, unknown> | undefined;
    if (Array.isArray(pagePatterns?.supports)) {
      return (pagePatterns.supports as string[]).join(', ');
    }
  } catch {
    // fallback
  }
  return 'route-page, drawer, modal, tab-page';
}
