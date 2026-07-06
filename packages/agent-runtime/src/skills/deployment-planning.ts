import type { JsonObject } from '@ai-engineering-agent/shared-types';
import type { SkillContext, SkillDefinition, SkillPrompt } from '@ai-engineering-agent/skill-sdk';

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
    const archTech = (ctx.architectureDesign as JsonObject | undefined)?.techStack as JsonObject | undefined;
    const archDeploy = archTech?.deployment as JsonObject | undefined;
    const profileDeployment = ctx.resolvedTargetProfile?.deployment as JsonObject | undefined;
    const strategy = String(archDeploy?.strategy ?? profileDeployment?.strategy ?? 'docker-compose');

    const strategyGuidance: Record<string, string> = {
      'docker-compose': '生成 Dockerfile + docker-compose.yml + nginx 配置，适合单机/小集群部署',
      kubernetes: '生成 Dockerfile + k8s Deployment/Service/Ingress/ConfigMap YAML，适合生产级集群部署',
      serverless: '生成 vercel.json / netlify.toml + 环境变量配置，适合前端+Serverless函数部署',
      static: '生成简单的 nginx.conf 或静态托管配置，适合纯前端项目',
    };

    const guidance = strategyGuidance[strategy] ?? strategyGuidance['docker-compose'];

    return {
      system: `你是一个 DevOps 部署专家。请根据项目信息和部署策略生成完整的部署配置。

部署策略: ${strategy} — ${guidance}

输出格式：
{
  "generatedFiles": [
    { "path": "deploy/...", "kind": "dockerfile|k8s|compose|nginx|env|serverless", "content": "完整的文件内容" }
  ],
  "notes": ["部署说明"]
}

${strategy === 'docker-compose' ? `docker-compose 策略要求：
- Dockerfile 使用多阶段构建
- docker-compose.yml 包含: nginx + api + db 服务
- Nginx 配置代理 / 到前端，/api/ 到后端
- 正确设置 depends_on、healthcheck、volumes
- 环境变量通过 .env 文件注入

生成文件: deploy/Dockerfile.api, deploy/Dockerfile.web, deploy/docker-compose.yml, deploy/nginx/default.conf, deploy/.env.example` : ''}

${strategy === 'kubernetes' ? `Kubernetes 策略要求：
- 生成 Deployment (api + web) 和 Service YAML
- 使用 Ingress 配置路由规则
- ConfigMap/Secret 管理配置
- 持久化存储使用 PVC

生成文件: deploy/k8s/api-deployment.yaml, deploy/k8s/web-deployment.yaml, deploy/k8s/db-statefulset.yaml, deploy/k8s/ingress.yaml, deploy/k8s/configmap.yaml, deploy/Dockerfile.api, deploy/Dockerfile.web` : ''}

${strategy === 'serverless' ? `Serverless 策略要求：
- 前端使用 Vercel/Netlify 配置
- API 函数使用各平台的 serverless function 格式
- 环境变量在平台配置中设置

生成文件: vercel.json 或 netlify.toml, api/*.ts (serverless functions), .env.example` : ''}

${strategy === 'static' ? `静态托管策略要求：
- Nginx 配置用于静态文件服务
- SPA 路由 fallback 到 index.html
- 无需后端容器

生成文件: deploy/nginx/default.conf, deploy/.env.example` : ''}

要求：
- 每个文件内容必须完整可运行，不要省略
- 根据部署策略选择正确的文件格式和路径
- 只输出 JSON`,

      user: `应用名: ${appName}
部署策略: ${strategy}
后端端口: ${backendPort}
前端端口: ${frontendPort}
数据库: ${dbType}

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
