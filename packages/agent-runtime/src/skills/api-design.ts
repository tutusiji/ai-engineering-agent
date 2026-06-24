/**
 * Skill: api-design
 *
 * 基于 DataModel + 需求规格，设计 RESTful API 契约。
 */

import type { JsonObject } from '../../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../../skill-sdk/src';

export const apiDesignSkill: SkillDefinition = {
  name: 'api-design',
  version: '0.1.0',
  description: '基于数据模型和页面需求设计 API 契约',
  inputSchema: { name: 'requirement-spec' },
  outputSchema: { name: 'api-contract' },
  defaultModel: { model: 'auto', temperature: 0.2 },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const featureName = String(input.featureName ?? '未知功能');
    const pages: JsonObject[] = Array.isArray(input.pages) ? (input.pages as JsonObject[]) : [];
    const entities: JsonObject[] = Array.isArray(input.entities) ? (input.entities as JsonObject[]) : [];
    const dataModel = input.dataModel as JsonObject | undefined;
    const dataEntities: JsonObject[] = (dataModel?.entities as JsonObject[] | undefined) ?? entities;
    const archTech = (ctx.architectureDesign as JsonObject | undefined)?.techStack as JsonObject | undefined;
    const archBackend = archTech?.backend as JsonObject | undefined;
    const profileBackend = ctx.resolvedTargetProfile?.backend as JsonObject | undefined;
    const backendFramework = String(archBackend?.framework ?? profileBackend?.framework ?? 'nestjs');

    return {
      system: `你是一个 API 设计专家。请根据页面需求和实体模型设计 RESTful API 契约。

输出 JSON 格式：
{
  "basePath": "/api/v1",
  "auth": "jwt",
  "endpoints": [
    {
      "method": "POST",
      "path": "/auth/login",
      "summary": "用户登录",
      "auth": false,
      "request": {
        "body": { "email": "string", "password": "string" }
      },
      "response": { "token": "string", "user": "User" },
      "errors": [401, 422]
    }
  ]
}

规则：
- basePath 统一用 /api/v1
- 每个实体生成标准 CRUD: GET /{entities}, GET /{entities}/:id, POST /{entities}, PUT /{entities}/:id, DELETE /{entities}/:id
- 认证端点 (login/register) auth 设为 false
- 分页参数用 query: page, pageSize
- 错误码覆盖: 400, 401, 403, 404, 422, 500
- 只输出 JSON，不要其他文字`,

      user: `功能: ${featureName}
后端框架: ${backendFramework}

页面需求:
${JSON.stringify(pages, null, 2)}

实体模型:
${JSON.stringify(dataEntities, null, 2)}`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    const rawEndpoints = (Array.isArray(raw.endpoints) ? raw.endpoints : []) as JsonObject[];
    return {
      basePath: String(raw.basePath ?? '/api/v1'),
      auth: String(raw.auth ?? 'jwt'),
      endpoints: rawEndpoints.map((ep: JsonObject) => ({
        method: String(ep.method ?? 'GET').toUpperCase(),
        path: String(ep.path ?? '/'),
        summary: String(ep.summary ?? ''),
        auth: ep.auth !== false,
        request: (ep.request ?? {}) as JsonObject,
        response: (ep.response ?? {}) as JsonObject,
        errors: (Array.isArray(ep.errors) ? ep.errors : []) as number[],
      })),
    };
  },
};
