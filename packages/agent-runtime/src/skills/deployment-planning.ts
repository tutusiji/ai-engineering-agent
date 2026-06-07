import type { JsonObject } from '../../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../../skill-sdk/src';

export const deploymentPlanningSkill: SkillDefinition = {
  name: 'deployment-planning',
  version: '0.1.0',
  description: '生成 Docker + Nginx + Compose 部署配置',
  inputSchema: { name: 'project-scaffold' },
  outputSchema: { name: 'deployment-config' },
  defaultModel: { model: 'auto', temperature: 0.1 },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const featureName = String(input.featureName ?? 'app');
    const appName = featureName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const backendPort = (input.backendPort as number) ?? 3000;
    const frontendPort = (input.frontendPort as number) ?? 80;
    const dbType = String(input.recommendedDb ?? 'postgresql');
    const deployment = ctx.resolvedTargetProfile?.deployment as JsonObject | undefined;
    const strategy = String(deployment?.strategy ?? 'docker-compose');

    return {
      system: `你是一个 DevOps 部署专家。请根据项目信息生成完整的部署配置。

输出格式：
{
  "generatedFiles": [
    { "path": "deploy/Dockerfile.api", "kind": "dockerfile", "content": "# Dockerfile 内容" },
    { "path": "deploy/Dockerfile.web", "kind": "dockerfile", "content": "# Dockerfile 内容" },
    { "path": "deploy/docker-compose.yml", "kind": "compose", "content": "# compose 文件内容" },
    { "path": "deploy/nginx/default.conf", "kind": "nginx", "content": "# nginx 配置内容" },
    { "path": "deploy/.env.example", "kind": "env", "content": "# 环境变量示例" }
  ],
  "notes": ["部署说明"]
}

要求：
- Dockerfile 使用多阶段构建
- docker-compose.yml 包含: nginx + api + db 服务
- Nginx 配置代理 / 到前端，/api/ 到后端
- 正确设置 depends_on、healthcheck、volumes
- 环境变量通过 .env 文件注入
- 每个文件内容必须完整可运行`,

      user: `应用名: ${appName}
部署策略: ${strategy}
后端端口: ${backendPort}
前端端口: ${frontendPort}
数据库: ${dbType}

后端: Node.js (NestJS/Express)
前端: 静态文件 (nginx serve)
数据库: PostgreSQL

项目信息:
${JSON.stringify(input, null, 2)}`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    const rawFiles = (Array.isArray(raw.generatedFiles) ? raw.generatedFiles : []) as JsonObject[];
    return {
      generatedFiles: rawFiles.map((f: JsonObject) => ({
        path: String(f.path ?? ''),
        kind: String(f.kind ?? 'file'),
        content: String(f.content ?? ''),
      })),
      notes: (Array.isArray(raw.notes) ? raw.notes : []) as string[],
    };
  },
};
