import type { JsonObject } from '../../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../../skill-sdk/src';

export const backendCodingSkill: SkillDefinition = {
  name: 'backend-coding',
  version: '0.1.0',
  description: '根据 API 契约和数据模型生成后端代码',
  inputSchema: { name: 'api-contract' },
  outputSchema: { name: 'generation-report' },
  defaultModel: { model: 'auto', temperature: 0.1 },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const apiContract: JsonObject = (input.apiContract ?? input) as JsonObject;
    const dataModel = input.dataModel as JsonObject | undefined;
    const entities: JsonObject[] = (dataModel?.entities as JsonObject[] | undefined) ?? [];
    const backend = ctx.resolvedTargetProfile?.backend as JsonObject | undefined;
    const framework = String(backend?.framework ?? 'nestjs');
    const language = String(backend?.language ?? 'typescript');
    const orm = String(backend?.orm ?? 'prisma');

    const frameworkGuidance: Record<string, string> = {
      nestjs: `NestJS + TypeScript 代码规范：
- 使用 @nestjs/common 装饰器 (@Controller, @Get, @Post, @Body, @Param)
- 使用 PrismaService 访问数据库
- DTO 使用 class-validator 装饰器
- 返回统一格式 { code: 0, data: ..., message: 'ok' }
- 每个实体对应一个 module (controller + service + module)`,
      fastapi: `FastAPI + Python 代码规范：
- 使用 @app.get/post/put/delete 装饰器
- 使用 SQLAlchemy 或 SQLModel
- Pydantic models 用于请求/响应
- 返回统一格式 { "code": 0, "data": ..., "message": "ok" }`,
      gin: `Gin + Go 代码规范：
- 使用 gin.Context，c.JSON() 返回
- 使用 GORM 访问数据库
- 结构体 tag: json, gorm
- 返回统一格式 {"code": 0, "data": ..., "message": "ok"}`,
    };

    const guidance = frameworkGuidance[framework] ?? frameworkGuidance.nestjs;

    return {
      system: `你是一个${framework} 后端开发专家。请根据 API 契约生成完整的后端代码。

${guidance}

输出格式：
{
  "generatedFiles": [
    { "path": "api/src/...", "kind": "controller|service|module|dto|model|migration", "content": "完整的源代码" }
  ],
  "notes": ["架构说明"]
}

重要：
- 每个文件必须包含完整可运行的代码（不要省略、不要 TODO）
- 文件路径按 ${framework} 标准项目结构组织
- 生成 Prisma schema / SQLAlchemy models / GORM models 对应 DataModel 中的实体
- 每个 API 端点都要实现（不要跳过）
- 只输出 JSON，generatedFiles 中每个文件的 content 是完整代码字符串`,

      user: `框架: ${framework} (${language})
ORM: ${orm}

API 契约:
${JSON.stringify(apiContract, null, 2)}

数据模型:
${JSON.stringify(entities, null, 2)}`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    const rawFiles = (Array.isArray(raw.generatedFiles) ? raw.generatedFiles : []) as JsonObject[];
    return {
      generatedFiles: rawFiles.map((f: JsonObject) => ({
        path: String(f.path ?? ''),
        kind: String(f.kind ?? 'module'),
        content: String(f.content ?? ''),
      })),
      notes: (Array.isArray(raw.notes) ? raw.notes : []) as string[],
    };
  },
};
