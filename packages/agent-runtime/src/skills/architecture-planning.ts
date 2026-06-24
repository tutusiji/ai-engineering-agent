/**
 * Skill: architecture-planning
 *
 * Takes structured requirements and produces a comprehensive architecture
 * design document covering system architecture, tech stack, component
 * breakdown, data flow, API design principles, and deployment architecture.
 *
 * This is an intermediate artifact — it guides coding but does not produce code.
 */

import type { JsonObject } from '../../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../../skill-sdk/src';

export const architecturePlanningSkill: SkillDefinition = {
  name: 'architecture-planning',
  version: '0.1.0',
  description: '根据需求生成全栈架构设计方案（系统架构、技术选型、模块划分、数据流、部署架构）',
  inputSchema: { name: 'requirement-spec' },
  outputSchema: { name: 'architecture-design' },
  defaultModel: { model: 'auto', temperature: 0.2, maxTokens: 16384 },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const mode = String(input.mode ?? 'generate');
    const isRefine = mode === 'refine';

    // ── Refinement mode ──
    if (isRefine) {
      const userMessage = String(input.userMessage ?? '');
      const currentMarkdown = String(input.currentMarkdown ?? '');
      const currentArchitecture = input.currentArchitecture as JsonObject | undefined;

      return {
        system: `你是一个资深全栈架构师。你的任务是**修改现有的架构设计方案**，响应用户的反馈意见。

## 当前架构方案

以下是当前的架构设计方案（JSON 格式）:

\`\`\`json
${JSON.stringify(currentArchitecture ?? {}, null, 2)}
\`\`\`

当前架构的 Markdown 描述:
\`\`\`markdown
${currentMarkdown}
\`\`\`

## 你的任务

用户对以上架构方案不满意，请根据用户的反馈精确修改架构。要求：

1. **仅修改用户提到的部分** — 保持未涉及的决策不变
2. **保持技术自洽** — 如果修改了前端框架，同步更新对应的 UI 库、路由、状态管理
3. **如果修改了数据库**，更新 databaseDesign.entities 和 deploymentArchitecture.components
4. **在 notes 中说明修改了什么以及为什么**
5. **输出完整的架构 JSON**（包含所有字段，不是只输出修改的部分）

你必须输出一个合法的 JSON 对象，格式与原始架构完全一致。只输出 JSON，不要其他文字。`,

        user: `用户反馈: ${userMessage}

请输出修改后的完整架构设计方案 JSON。`,
      };
    }

    // ── Generate mode (original) ──
    const featureName = String(input.featureName ?? '未命名项目');
    const businessGoal = String(input.businessGoal ?? '');
    const pages: JsonObject[] = Array.isArray(input.pages) ? (input.pages as JsonObject[]) : [];
    const entities: JsonObject[] = Array.isArray(input.entities) ? (input.entities as JsonObject[]) : [];

    // Read profile as optional preference hint, NOT as authoritative values
    const profileHint = ctx.resolvedTargetProfile;
    const profileFramework = profileHint?.framework as string | undefined;
    const profileBackend = profileHint?.backend as JsonObject | undefined;
    const profileDatabase = profileHint?.database as JsonObject | undefined;
    const profileDeployment = profileHint?.deployment as JsonObject | undefined;

    // Build preference section if profile exists
    let preferenceSection = '';
    if (profileHint) {
      preferenceSection = `
## 用户偏好（可选参考）

用户选择了一个目标 profile: **${profileHint.id ?? 'unknown'}**（平台: ${profileHint.platform ?? '未知'}）。

Profile 中预置的技术偏好（仅供参考，你可以根据实际需求覆盖）:
- 前端框架: ${profileFramework ?? '未指定'}
- UI 库: ${profileHint.uiLibrary ?? '未指定'}
- 后端框架: ${profileBackend?.framework ?? '未指定'}
- ORM: ${profileBackend?.orm ?? '未指定'}
- 数据库: ${profileDatabase?.candidates ?? '未指定'}
- 部署: ${profileDeployment?.strategy ?? '未指定'}

**重要**: 以上仅为用户偏好提示。你需要根据需求的实际特点（并发量、数据复杂度、团队技能假设、业务场景等）独立判断这些选择是否合适。如果需求特征与 profile 预置的技术栈不匹配，你应该使用更合适的技术并说明理由。`;
    } else {
      preferenceSection = `
## 技术选型说明

你没有收到预设的 profile 偏好。请完全根据需求特点独立做出所有技术选型决策。
考虑因素：项目规模、并发需求、数据复杂度、实时性要求、团队学习曲线、生态成熟度。`;
    }

    // Generate page/entity context
    const pageNames = pages.map((p: JsonObject) => String(p.name ?? '')).filter(Boolean).join(', ');
    const entityNames = entities.map((e: JsonObject) => String(e.name ?? '')).filter(Boolean).join(', ');

    return {
      system: `你是一个资深全栈架构师。你的任务是根据需求规格，独立做出所有技术选型决策，输出一份完整的、可执行的架构设计方案。

## 项目信息

- 功能名称: ${featureName}
- 业务目标: ${businessGoal}${pageNames ? `\n- 页面列表: ${pageNames}` : ''}${entityNames ? `\n- 数据实体: ${entityNames}` : ''}
${preferenceSection}

## 你需要独立做出的技术决策

请基于需求特征，自主决定以下每一项技术选型，并在输出中给出选择理由：

### 前端
- **framework**: react | vue3 | svelte | solid | angular — 根据项目复杂度和团队生态选择
- **uiLibrary**: antd | element-plus | shadcn/ui | radix | material-ui | naive-ui | arco-design — 与框架匹配的组件库
- **stateManagement**: zustand | pinia | jotai | redux | mobx — 根据状态复杂度选择
- **router**: react-router | vue-router | tanstack-router — 与框架匹配
- **styling**: tailwindcss | css-modules | styled-components | unocss — 样式方案

### 后端
- **framework**: nestjs | fastapi | gin | express | spring-boot | actix-web — 根据性能需求和生态选择
- **language**: typescript | python | go | java | rust — 与框架匹配
- **orm**: prisma | typeorm | sqlalchemy | gorm | jpa | drizzle — 与语言和后端框架匹配
- **auth**: jwt | session | oauth2 | clerk | next-auth — 认证方案
- **apiStyle**: RESTful | GraphQL | tRPC — API 风格

### 数据库
- **primary**: postgresql | mysql | mongodb | sqlite | cockroachdb — 根据数据结构选择
- **caching**: redis | memcached | none — 缓存方案

### 部署
- **strategy**: docker-compose | kubernetes | serverless | static — 部署策略
- **services**: 需要的容器/服务列表

## 输出格式

你必须输出一个合法的 JSON 对象，所有 techStack 字段必须填写具体值，不能留空或写"待定":

{
  "projectName": "项目名称",
  "overview": "项目概述（一段话描述整体架构思路和关键技术选型理由）",

  "systemArchitecture": {
    "diagram": "文字描述的架构图（前端→API网关→后端服务→数据库→缓存）",
    "layers": [
      { "name": "展示层", "description": "前端应用及技术", "technologies": ["具体技术名"] },
      { "name": "API层", "description": "API网关/接口层", "technologies": ["具体技术名"] },
      { "name": "业务层", "description": "后端服务", "technologies": ["具体技术名"] },
      { "name": "数据层", "description": "数据库和缓存", "technologies": ["具体技术名"] }
    ]
  },

  "techStack": {
    "frontend": {
      "framework": "必须填写具体框架名，如 react",
      "uiLibrary": "必须填写具体UI库名，如 antd",
      "stateManagement": "必须填写，如 zustand",
      "router": "必须填写，如 react-router",
      "styling": "必须填写，如 tailwindcss"
    },
    "backend": {
      "framework": "必须填写具体框架名，如 nestjs",
      "language": "必须填写，如 typescript",
      "orm": "必须填写，如 prisma",
      "auth": "必须填写，如 jwt",
      "apiStyle": "必须填写，如 RESTful"
    },
    "database": {
      "primary": "必须填写，如 postgresql",
      "caching": "必须填写，如 redis"
    },
    "deployment": {
      "strategy": "必须填写，如 docker-compose",
      "services": ["nginx", "api", "db"]
    }
  },

  "moduleBreakdown": [
    {
      "name": "模块名称",
      "type": "frontend|backend|shared",
      "description": "模块职责描述",
      "dependsOn": ["依赖模块"],
      "keyFiles": ["预计生成的关键文件路径"]
    }
  ],

  "dataFlow": {
    "description": "数据流总体描述",
    "flows": [
      { "name": "流程名称", "steps": ["步骤1: ...", "步骤2: ..."] }
    ]
  },

  "apiDesignPrinciples": {
    "style": "RESTful",
    "basePath": "/api/v1",
    "auth": "JWT Bearer Token",
    "errorFormat": "{ code: number, message: string, data: any }",
    "pagination": "page + pageSize query params",
    "versioning": "URL path versioning (/api/v1/)"
  },

  "databaseDesign": {
    "strategy": "实体关系和数据模型设计策略",
    "entities": [
      { "name": "实体名", "description": "...", "keyFields": ["字段1"], "relations": ["关联描述"] }
    ],
    "indexStrategy": "索引设计策略"
  },

  "securityConsiderations": [
    "安全考虑1: 具体描述（不能是泛泛的"XSS防护"，要结合具体技术栈）"
  ],

  "deploymentArchitecture": {
    "description": "部署架构描述",
    "components": [
      { "name": "组件名", "role": "角色", "port": 80, "dependsOn": [] }
    ],
    "scalingStrategy": "扩展策略描述"
  },

  "developmentPhases": [
    { "phase": "Phase 1", "name": "阶段名", "goal": "目标", "deliverables": ["交付物1"] }
  ],

  "risksAndMitigations": [
    { "risk": "风险描述", "impact": "high|medium|low", "mitigation": "缓解措施" }
  ],

  "openDecisions": ["需要进一步确认的技术决策"],

  "notes": ["架构设计说明和权衡考虑"]
}

## 严格要求

1. **每个 techStack 字段必须有具体的实际值** — 不允许 "待定"、"根据情况选择"、空字符串
2. **技术选型要自洽** — 前端 react 配 antd，vue 配 element-plus；后端 nestjs 配 prisma，fastapi 配 sqlalchemy
3. **moduleBreakdown 要覆盖前后端所有模块**，每个模块说明清楚职责
4. **dataFlow 描述 2-3 个核心业务流程**的具体步骤
5. **securityConsiderations 要具体**，结合你选的技术栈说明（如"使用 bcrypt 哈希密码"而不是"密码安全"）
6. **developmentPhases 按优先级排序**，Phase 1 是最小可用版本
7. **如果覆盖了 profile 预设值，在 overview 或 notes 中说明理由**
8. **只输出 JSON，不要其他文字**`,

      user: `需求规格:
${JSON.stringify(input, null, 2)}

请独立分析需求，做出所有技术选型决策，输出完整的架构设计方案。${profileHint ? '\n注意：上面的用户偏好仅供参考，请根据需求实际特征独立判断。' : ''}`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    return {
      projectName: String(raw.projectName ?? '未命名项目'),
      overview: String(raw.overview ?? ''),
      systemArchitecture: normalizeObject(raw.systemArchitecture as JsonObject),
      techStack: normalizeObject(raw.techStack as JsonObject),
      moduleBreakdown: Array.isArray(raw.moduleBreakdown) ? raw.moduleBreakdown : [],
      dataFlow: normalizeObject(raw.dataFlow as JsonObject),
      apiDesignPrinciples: normalizeObject(raw.apiDesignPrinciples as JsonObject),
      databaseDesign: normalizeObject(raw.databaseDesign as JsonObject),
      securityConsiderations: Array.isArray(raw.securityConsiderations) ? raw.securityConsiderations : [],
      deploymentArchitecture: normalizeObject(raw.deploymentArchitecture as JsonObject),
      developmentPhases: Array.isArray(raw.developmentPhases) ? raw.developmentPhases : [],
      risksAndMitigations: Array.isArray(raw.risksAndMitigations) ? raw.risksAndMitigations : [],
      openDecisions: Array.isArray(raw.openDecisions) ? raw.openDecisions : [],
      notes: Array.isArray(raw.notes) ? raw.notes : [],
    };
  },
};

function normalizeObject(obj: JsonObject | undefined): JsonObject {
  return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
}
