/**
 * Skill: data-modeling
 *
 * 从结构化需求中提取实体、字段、关系，输出 DataModel。
 * 根据实体特征推荐最合适的数据库。
 */

import type { JsonObject } from '@ai-engineering-agent/shared-types';
import type { SkillContext, SkillDefinition, SkillPrompt } from '@ai-engineering-agent/skill-sdk';

export const dataModelingSkill: SkillDefinition = {
  name: 'data-modeling',
  version: '0.1.0',
  description: '从需求文档提取数据模型，推荐数据库',
  inputSchema: { name: 'requirement-spec' },
  outputSchema: { name: 'data-model' },
  defaultModel: { model: 'auto', temperature: 0.2 },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const featureName = String(input.featureName ?? '未知功能');
    const pages: JsonObject[] = Array.isArray(input.pages) ? (input.pages as JsonObject[]) : [];
    const entities: JsonObject[] = Array.isArray(input.entities) ? (input.entities as JsonObject[]) : [];
    const archTech = (ctx.architectureDesign as JsonObject | undefined)?.techStack as JsonObject | undefined;
    const archBackend = archTech?.backend as JsonObject | undefined;
    const profileBackend = ctx.resolvedTargetProfile?.backend as JsonObject | undefined;
    const backendFramework = String(archBackend?.framework ?? profileBackend?.framework ?? 'nestjs');

    return {
      system: `你是一个数据库架构专家。请根据需求规格输出结构化的数据模型。

输出 JSON 格式：
{
  "entities": [
    {
      "name": "User",
      "fields": [
        { "name": "id", "type": "uuid", "primary": true },
        { "name": "email", "type": "string", "unique": true, "nullable": false }
      ],
      "relations": [
        { "kind": "hasMany", "target": "Post", "foreignKey": "authorId" }
      ],
      "indexes": [
        { "fields": ["email"], "unique": true }
      ]
    }
  ],
  "recommendedDb": "postgresql",
  "reasoning": "推荐理由"
}

规则：
- 每个实体必须有 id 字段（uuid 类型，primary）
- 时间戳字段统一用 createdAt / updatedAt（datetime 类型）
- fields 中的 type 必须是: uuid, string, number, boolean, date, datetime, text, json, enum
- 如果 type 是 enum，必须提供 values 数组
- relations 的 kind 必须是: hasOne, hasMany, belongsTo, manyToMany
- 存在多表关联 → 推荐 postgresql
- 简单键值存储 → 推荐 sqlite
- 需要全文搜索 → 推荐 postgresql
- 只输出 JSON，不要其他文字`,

      user: `功能: ${featureName}
后端框架: ${backendFramework}

页面列表:
${JSON.stringify(pages, null, 2)}

初步实体线索:
${JSON.stringify(entities, null, 2)}`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    const rawEntities = (Array.isArray(raw.entities) ? raw.entities : []) as JsonObject[];
    return {
      entities: rawEntities.map((e: JsonObject) => ({
        name: String(e.name ?? 'Unnamed'),
        fields: (Array.isArray(e.fields) ? e.fields : []) as JsonObject[],
        relations: (Array.isArray(e.relations) ? e.relations : []) as JsonObject[],
        indexes: (Array.isArray(e.indexes) ? e.indexes : []) as JsonObject[],
      })),
      recommendedDb: String(raw.recommendedDb ?? 'postgresql'),
      reasoning: String(raw.reasoning ?? ''),
    };
  },
};
