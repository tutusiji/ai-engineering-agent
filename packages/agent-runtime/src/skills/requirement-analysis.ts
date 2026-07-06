/**
 * Skill: requirement-analysis
 *
 * Takes a user's natural language description and produces a structured
 * RequirementSpec with feature name, pages, entities, and risks.
 */

import type { JsonObject } from '@ai-engineering-agent/shared-types';
import type { SkillContext, SkillDefinition, SkillPrompt } from '@ai-engineering-agent/skill-sdk';

export const requirementAnalysisSkill: SkillDefinition = {
  name: 'requirement-analysis',
  version: '0.1.0',
  description: '将用户自然语言描述结构化为 RequirementSpec',
  inputSchema: { name: 'requirement-chat-input' },
  outputSchema: { name: 'requirement-spec' },
  defaultModel: {
    model: 'auto',
    temperature: 0.2,
  },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const userPrompt = String(input.userPrompt ?? '');
    const targetProfileId = ctx.targetProfile?.id ?? '未指定';

    return {
      system: `你是一个全栈需求分析专家。你的任务是把用户的自然语言描述转换成结构化的全栈需求规格（包含前端、后端、数据库、部署等维度）。

你必须输出一个合法的 JSON 对象，格式如下：
{
  "featureName": "功能名称（简短命名）",
  "businessGoal": "业务目标（一句话描述这个功能要解决什么问题）",
  "pages": [
    {
      "name": "页面名称",
      "goal": "这个页面的目标",
      "actions": ["用户可以执行的操作1", "用户可以执行的操作2"],
      "fields": [
        { "name": "字段名", "type": "string|number|boolean|date|enum", "required": true/false, "description": "字段描述" }
      ]
    }
  ],
  "entities": [
    {
      "name": "实体名称",
      "fields": [
        { "name": "字段名", "type": "string|number|boolean|date", "required": true/false, "description": "字段描述" }
      ]
    }
  ],
  "permissions": ["需要的权限1", "需要的权限2"],
  "risks": ["潜在风险1", "潜在风险2"]
}

要求：
- pages 至少要包含用户提到的页面
- actions 要具体，比如"新增用户"而不是"操作"
- fields 的 type 要尽可能精确
- 如果用户没有提到某些信息，根据全栈 Web 应用的常见模式合理推断
- 只输出 JSON，不要有其他文字`,

      user: `目标 profile: ${targetProfileId}

用户需求描述:
${userPrompt}`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    // Ensure required fields exist
    const result: JsonObject = {
      featureName: String(raw.featureName ?? '未命名功能'),
      businessGoal: String(raw.businessGoal ?? ''),
      pages: Array.isArray(raw.pages) ? raw.pages : [],
      entities: Array.isArray(raw.entities) ? raw.entities : [],
    };

    if (Array.isArray(raw.permissions)) {
      result.permissions = raw.permissions;
    }
    if (Array.isArray(raw.risks)) {
      result.risks = raw.risks;
    }

    return result;
  },
};
