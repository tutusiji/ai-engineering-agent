# 全栈项目生成平台 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AI Frontend Engineering Agent 从前端工程生成平台升级为全栈 Web 应用生成平台（前端 + 后端 + 数据库 + 部署 + DataView 监控）。

**Architecture:** 扩展 Target Profile 为四维组合（frontend/backend/database/deployment），新增4个 contracts 结构化后端产物，新增4个 Agent Skills 负责后端推理生成，新增4个 Plugins 负责确定性代码执行，新增 DataView 模块提供全流程监控和回溯能力。所有改动基于现有 monorepo 结构，保持 packages/plugins/apps 分层不变。

**Tech Stack:** TypeScript + Node.js / Express (API) + React + Vite + HeroUI (Web) + PostgreSQL (persistence) + Prism.js (syntax highlighting)

---

## 文件结构映射

### 新建文件
```
policies/targets/fullstack-vue3-nestjs.yaml        # 全栈 profile 示例
policies/targets/fullstack-react-nestjs.yaml        # 全栈 profile 示例
contracts/data-model.schema.json                    # DataModel contract
contracts/api-contract.schema.json                  # ApiContract contract
contracts/deployment-config.schema.json             # DeploymentConfig contract
contracts/project-scaffold.schema.json              # ProjectScaffold contract
packages/agent-runtime/src/skills/data-modeling.ts   # 数据建模 skill
packages/agent-runtime/src/skills/api-design.ts      # API 设计 skill
packages/agent-runtime/src/skills/backend-coding.ts  # 后端代码生成 skill
packages/agent-runtime/src/skills/deployment-planning.ts # 部署规划 skill
plugins/api-scaffold/                                # API 脚手架插件
plugins/db-migration/                                # DB 迁移插件
plugins/docker-generator/                            # Docker 生成插件
plugins/api-contract-validator/                      # API 契约校验插件
packages/persistence/src/metrics.ts                  # ProjectMetrics 存储
apps/studio-web/src/components/DataViewPanel.tsx      # DataView 主面板
apps/studio-web/src/components/MetricsProgress.tsx    # 实时进度子面板
apps/studio-web/src/components/MetricsArtifacts.tsx   # 产物统计子面板
apps/studio-web/src/components/MetricsHistory.tsx     # 历史回溯子面板
apps/studio-web/src/components/MetricsQuality.tsx     # 质量统计子面板
apps/studio-web/src/hooks/useMetrics.ts               # DataView data hook
```

### 修改文件
```
policies/targets/vue3-admin.yaml                    # 扩展 backend/database/deployment 字段
policies/targets/react-admin.yaml                   # 同上
policies/targets/pc-spa.yaml                        # 同上
policies/targets/h5-spa.yaml                        # 同上
policies/targets/wechat-miniapp.yaml                # 同上
packages/policy-engine/src/index.ts                 # 扩展 TargetProfileDefinition 类型
packages/contract-schema/src/index.ts               # 无需改（自动发现新 schema）
packages/agent-runtime/src/index.ts                 # 注册新 skills
packages/agent-runtime/src/skills/code-generation.ts # 重命名为 frontend-coding
packages/persistence/src/index.ts                   # 导出 metrics 模块
apps/studio-api/src/server.ts                       # 新增 /api/metrics/* 端点
apps/studio-web/src/App.tsx                         # 添加 DataView 导航
apps/studio-web/src/components/Sidebar.tsx          # 增加 DataView 导航项
workflows/from-idea-to-app.yaml                     # 扩展为全栈工作流
```

---

## Phase 1: Target Profile 扩展

### Task 1.1: 扩展 TargetProfileDefinition 类型

**Files:**
- Modify: `packages/policy-engine/src/index.ts`

- [ ] **Step 1: 更新类型定义**

将 `TargetProfileDefinition` 从纯前端结构扩展为包含四维描述：

```typescript
// packages/policy-engine/src/index.ts — 替换原 TargetProfileDefinition
export interface BackendProfile {
  framework: string;       // nestjs | express | fastapi | gin
  language: string;        // typescript | python | go
  orm?: string;            // prisma | typeorm | sqlalchemy | gorm
  patterns: string[];      // [crud, auth, upload, export, pagination]
  testing?: string[];      // [jest, supertest, pytest, go-test]
}

export interface DatabaseProfile {
  strategy: 'auto-recommend' | 'fixed';
  candidates?: string[];   // [postgresql, sqlite, mysql]
  migration: 'auto' | 'manual';
}

export interface DeploymentProfile {
  strategy: 'docker-compose' | 'k8s' | 'static';
  components: string[];    // [nginx, api, db]
}

export interface TargetProfileDefinition extends TargetProfileRef {
  // 前端（保持）
  uiLibrary?: string;
  routingMode?: string;
  styling?: string[];
  pagePatterns?: JsonObject;
  preferredPlugins?: JsonObject;
  validation?: JsonObject;

  // 后端（新增）
  backend?: BackendProfile;

  // 数据库（新增）
  database?: DatabaseProfile;

  // 部署（新增）
  deployment?: DeploymentProfile;
}
```

- [ ] **Step 2: 验证类型检查**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent && pnpm typecheck
```

预期：无新增类型错误。现有的 5 个 target yaml 没有新字段，TypeScript optional 属性不会报错。

- [ ] **Step 3: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add packages/policy-engine/src/index.ts
git commit -m "feat(policy-engine): extend TargetProfileDefinition with backend/database/deployment fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1.2: 更新现有 5 个 target profile YAML

**Files:**
- Modify: `policies/targets/vue3-admin.yaml`
- Modify: `policies/targets/react-admin.yaml`
- Modify: `policies/targets/pc-spa.yaml`
- Modify: `policies/targets/h5-spa.yaml`
- Modify: `policies/targets/wechat-miniapp.yaml`

- [ ] **Step 1: 扩展 vue3-admin 为全栈**

```yaml
# policies/targets/vue3-admin.yaml — 完整替换
id: vue3-admin
platform: admin-web
framework: vue3
uiLibrary: element-plus
routingMode: vue-router
styling:
  - tailwindcss
  - unocss
pagePatterns:
  supports:
    - route-page
    - drawer
    - modal
    - tab-page
preferredPlugins:
  scanner: vue3-project-scanner
  navigation: route-menu-decider
  generator: crud-page-generator
validation:
  visualRegression: true
  playwright: true

# 新增字段
backend:
  framework: nestjs
  language: typescript
  orm: prisma
  patterns: [crud, auth, upload, export, pagination]
  testing: [jest, supertest]

database:
  strategy: auto-recommend
  candidates: [postgresql, sqlite]
  migration: auto

deployment:
  strategy: docker-compose
  components: [nginx, api, db]
```

- [ ] **Step 2: 扩展 react-admin**

```yaml
# policies/targets/react-admin.yaml — 完整替换
id: react-admin
platform: admin-web
framework: react
uiLibrary: antd
routingMode: react-router
styling:
  - tailwindcss
pagePatterns:
  supports:
    - route-page
    - drawer
    - modal
    - tab-page
preferredPlugins:
  scanner: react-project-scanner
  navigation: route-menu-decider
  generator: crud-page-generator
validation:
  visualRegression: true
  playwright: true

backend:
  framework: nestjs
  language: typescript
  orm: prisma
  patterns: [crud, auth, upload, export, pagination]
  testing: [jest, supertest]

database:
  strategy: auto-recommend
  candidates: [postgresql, sqlite]
  migration: auto

deployment:
  strategy: docker-compose
  components: [nginx, api, db]
```

- [ ] **Step 3: 扩展 pc-spa、h5-spa、wechat-miniapp**

三个 profile 的 backend/database/deployment 字段相同（都为 nestjs + prisma + docker-compose），因为后端框架与前端类型无关：

```yaml
# 以下三个文件均追加相同内容
# policies/targets/pc-spa.yaml, h5-spa.yaml, wechat-miniapp.yaml

backend:
  framework: nestjs
  language: typescript
  orm: prisma
  patterns: [crud, auth, upload, export, pagination]
  testing: [jest, supertest]

database:
  strategy: auto-recommend
  candidates: [postgresql, sqlite]
  migration: auto

deployment:
  strategy: docker-compose
  components: [nginx, api, db]
```

用 Edit 工具分别追加到这三个文件末尾。

- [ ] **Step 4: 添加两个全栈组合 profile**

```yaml
# policies/targets/fullstack-vue3-nestjs.yaml（新建）
id: fullstack-vue3-nestjs
platform: fullstack
framework: vue3
uiLibrary: element-plus
routingMode: vue-router
styling:
  - tailwindcss
pagePatterns:
  supports:
    - route-page
    - drawer
    - modal
    - tab-page
preferredPlugins:
  scanner: vue3-project-scanner
  navigation: route-menu-decider
  generator: crud-page-generator
validation:
  visualRegression: true
  playwright: true

backend:
  framework: nestjs
  language: typescript
  orm: prisma
  patterns: [crud, auth, upload, export, pagination]
  testing: [jest, supertest]

database:
  strategy: auto-recommend
  candidates: [postgresql, sqlite]
  migration: auto

deployment:
  strategy: docker-compose
  components: [nginx, api, db]
```

```yaml
# policies/targets/fullstack-react-nestjs.yaml（新建）
id: fullstack-react-nestjs
platform: fullstack
framework: react
uiLibrary: antd
routingMode: react-router
styling:
  - tailwindcss
pagePatterns:
  supports:
    - route-page
    - drawer
    - modal
    - tab-page
preferredPlugins:
  scanner: react-project-scanner
  navigation: route-menu-decider
  generator: crud-page-generator
validation:
  visualRegression: true
  playwright: true

backend:
  framework: nestjs
  language: typescript
  orm: prisma
  patterns: [crud, auth, upload, export, pagination]
  testing: [jest, supertest]

database:
  strategy: auto-recommend
  candidates: [postgresql, sqlite]
  migration: auto

deployment:
  strategy: docker-compose
  components: [nginx, api, db]
```

- [ ] **Step 5: 验证 profile 加载**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent && pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add policies/targets/
git commit -m "feat(policies): extend all target profiles with backend/database/deployment dimensions

Add fullstack-vue3-nestjs and fullstack-react-nestjs combo profiles.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1.3: 添加 profile 按维度查询 API

**Files:**
- Modify: `apps/studio-api/src/server.ts:206-218`

- [ ] **Step 1: 扩展 GET /api/profiles 支持查询参数**

定位到 server.ts 的 `/api/profiles` 路由（第 206 行附近），替换为：

```typescript
// Profiles — with optional dimension filters
app.get('/api/profiles', async (req, res) => {
  try {
    const profileIds = await policies.listTargetProfiles();
    const frontendFilter = req.query.frontend as string | undefined;
    const backendFilter = req.query.backend as string | undefined;

    const profiles = [];
    for (const id of profileIds) {
      const p = await policies.getTargetProfile(id);
      if (!p) continue;

      // Apply dimension filters
      if (frontendFilter && p.framework !== frontendFilter) continue;
      if (backendFilter && (p as Record<string, unknown>).backend) {
        const be = (p as Record<string, unknown>).backend as Record<string, unknown> | undefined;
        if (be?.framework !== backendFilter) continue;
      }

      profiles.push({ id, ...p });
    }
    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 2: 验证 API**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
# 启动 API
pnpm studio:api &
sleep 2
# 测试查询
curl -s http://localhost:4401/api/profiles | head -200
curl -s "http://localhost:4401/api/profiles?frontend=vue3&backend=nestjs"
# 停止
kill %1
```

预期：返回过滤后的 profile 列表。第一个请求返回全部 7 个（5 原有 + 2 全栈），第二个仅返回 vue3+nestjs 匹配项。

- [ ] **Step 3: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add apps/studio-api/src/server.ts
git commit -m "feat(api): add frontend/backend dimension filters to GET /api/profiles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 2: 新增 Contracts

### Task 2.1: 创建 DataModel schema

**Files:**
- Create: `contracts/data-model.schema.json`

- [ ] **Step 1: 写入 schema 文件**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "data-model.schema.json",
  "title": "DataModel",
  "description": "结构化数据模型 — 实体、字段、关系、索引",
  "type": "object",
  "required": ["entities", "recommendedDb"],
  "properties": {
    "entities": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "fields"],
        "properties": {
          "name": { "type": "string", "description": "实体名（单数，PascalCase）" },
          "fields": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["name", "type"],
              "properties": {
                "name": { "type": "string" },
                "type": { "type": "string", "enum": ["uuid", "string", "number", "boolean", "date", "datetime", "text", "json", "enum"] },
                "primary": { "type": "boolean" },
                "unique": { "type": "boolean" },
                "nullable": { "type": "boolean" },
                "default": {},
                "values": { "type": "array", "items": { "type": "string" }, "description": "枚举值（type=enum 时必填）" },
                "description": { "type": "string" }
              }
            }
          },
          "relations": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["kind", "target", "foreignKey"],
              "properties": {
                "kind": { "type": "string", "enum": ["hasOne", "hasMany", "belongsTo", "manyToMany"] },
                "target": { "type": "string" },
                "foreignKey": { "type": "string" }
              }
            }
          },
          "indexes": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["fields"],
              "properties": {
                "fields": { "type": "array", "items": { "type": "string" } },
                "unique": { "type": "boolean" }
              }
            }
          }
        }
      }
    },
    "recommendedDb": {
      "type": "string",
      "enum": ["postgresql", "mysql", "sqlite"],
      "description": "Agent 推荐的数据库类型"
    },
    "reasoning": {
      "type": "string",
      "description": "推荐理由"
    }
  }
}
```

- [ ] **Step 2: 验证 schema 可加载**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
node -e "
const { FileSchemaRegistry } = require('./packages/contract-schema/dist/index.js') || {};
console.log('Schema file exists and is valid JSON');
"
```

- [ ] **Step 3: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add contracts/data-model.schema.json
git commit -m "feat(contracts): add DataModel schema for structured data modeling

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2.2: 创建 ApiContract schema

**Files:**
- Create: `contracts/api-contract.schema.json`

- [ ] **Step 1: 写入 schema 文件**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "api-contract.schema.json",
  "title": "ApiContract",
  "description": "API 契约 — 端点列表、请求/响应结构、错误码",
  "type": "object",
  "required": ["basePath", "auth", "endpoints"],
  "properties": {
    "basePath": { "type": "string", "description": "如 /api/v1" },
    "auth": { "type": "string", "enum": ["none", "jwt", "session", "apikey"] },
    "endpoints": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["method", "path"],
        "properties": {
          "method": { "type": "string", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"] },
          "path": { "type": "string", "description": "如 /users/:id" },
          "summary": { "type": "string" },
          "auth": { "type": "boolean", "description": "是否需要认证" },
          "request": {
            "type": "object",
            "properties": {
              "params": { "type": "object", "additionalProperties": { "type": "string" } },
              "query": { "type": "object", "additionalProperties": { "type": "string" } },
              "body": { "type": "object", "additionalProperties": { "type": "string" } }
            }
          },
          "response": {
            "type": "object",
            "additionalProperties": { "type": "string" }
          },
          "errors": {
            "type": "array",
            "items": { "type": "integer" },
            "description": "可能的 HTTP 错误码"
          }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add contracts/api-contract.schema.json
git commit -m "feat(contracts): add ApiContract schema for API endpoint specification

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2.3: 创建 DeploymentConfig 和 ProjectScaffold schema

**Files:**
- Create: `contracts/deployment-config.schema.json`
- Create: `contracts/project-scaffold.schema.json`

- [ ] **Step 1: 创建 deployment-config.schema.json**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "deployment-config.schema.json",
  "title": "DeploymentConfig",
  "description": "部署配置 — 服务、端口、环境变量、数据卷",
  "type": "object",
  "required": ["services"],
  "properties": {
    "services": {
      "type": "array",
      "items": { "type": "string", "enum": ["nginx", "api", "db", "redis", "worker"] }
    },
    "ports": {
      "type": "object",
      "additionalProperties": { "type": "integer" }
    },
    "envVars": {
      "type": "array",
      "items": { "type": "string" }
    },
    "volumes": {
      "type": "array",
      "items": { "type": "string" }
    },
    "healthChecks": {
      "type": "object",
      "additionalProperties": { "type": "string" }
    },
    "domains": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "project-scaffold.schema.json",
  "title": "ProjectScaffold",
  "description": "项目骨架计划 — 目录结构、入口文件、包管理",
  "type": "object",
  "required": ["structure"],
  "properties": {
    "structure": {
      "type": "object",
      "required": ["directories"],
      "properties": {
        "directories": {
          "type": "array",
          "items": { "type": "string" }
        },
        "entryPoints": {
          "type": "object",
          "additionalProperties": { "type": "string" }
        }
      }
    },
    "packageManager": {
      "type": "string",
      "enum": ["pnpm", "npm", "yarn", "poetry", "go-mod"]
    },
    "monorepo": { "type": "boolean" },
    "packages": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add contracts/deployment-config.schema.json contracts/project-scaffold.schema.json
git commit -m "feat(contracts): add DeploymentConfig and ProjectScaffold schemas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2.4: 扩展 contract-schema 包增加辅助查询方法

**Files:**
- Modify: `packages/contract-schema/src/index.ts`

- [ ] **Step 1: 添加 schema 校验辅助方法**

在 `FileSchemaRegistry` 类的 `listAvailable` 方法后追加：

```typescript
  /**
   * 校验一个 JSON 对象是否符合指定 schema（基础版本，仅检查 required 字段）。
   * 后续可替换为 ajv 等完整 JSON Schema 校验器。
   */
  async validate(ref: SchemaRef, data: JsonObject): Promise<{ valid: boolean; errors: string[] }> {
    const schema = await this.get(ref);
    if (!schema) {
      return { valid: false, errors: [`Schema not found: ${ref.name}`] };
    }

    const errors: string[] = [];
    const required = (schema as Record<string, unknown>).required as string[] | undefined;
    if (required) {
      for (const field of required) {
        if (!(field in data) || data[field] === undefined || data[field] === null) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
```

- [ ] **Step 2: 验证类型检查**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add packages/contract-schema/src/index.ts
git commit -m "feat(contract-schema): add validate method for basic schema validation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 3: 新增 Agent Skills

### Task 3.1: 创建 data-modeling skill

**Files:**
- Create: `packages/agent-runtime/src/skills/data-modeling.ts`

- [ ] **Step 1: 写入 skill 定义**

```typescript
/**
 * Skill: data-modeling
 *
 * 从结构化需求中提取实体、字段、关系，输出 DataModel。
 * 根据实体特征推荐最合适的数据库。
 */

import type { JsonObject } from '../../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../../skill-sdk/src';

export const dataModelingSkill: SkillDefinition = {
  name: 'data-modeling',
  version: '0.1.0',
  description: '从需求文档提取数据模型，推荐数据库',
  inputSchema: { name: 'requirement-spec' },
  outputSchema: { name: 'data-model' },
  defaultModel: {
    model: 'auto',
    temperature: 0.2,
  },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const featureName = input.featureName ?? '未知功能';
    const pages = Array.isArray(input.pages) ? input.pages : [];
    const entities = Array.isArray(input.entities) ? input.entities : [];
    const backendFramework = (ctx.resolvedTargetProfile as JsonObject)?.backend
      ? ((ctx.resolvedTargetProfile as JsonObject).backend as JsonObject)?.framework ?? 'nestjs'
      : 'nestjs';

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
    return {
      entities: Array.isArray(raw.entities) ? raw.entities.map((e: JsonObject) => ({
        name: String(e.name ?? 'Unnamed'),
        fields: Array.isArray(e.fields) ? e.fields : [],
        relations: Array.isArray(e.relations) ? e.relations : [],
        indexes: Array.isArray(e.indexes) ? e.indexes : [],
      })) : [],
      recommendedDb: String(raw.recommendedDb ?? 'postgresql'),
      reasoning: String(raw.reasoning ?? ''),
    };
  },
};
```

- [ ] **Step 2: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add packages/agent-runtime/src/skills/data-modeling.ts
git commit -m "feat(skills): add data-modeling skill for structured data model extraction

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3.2: 创建 api-design skill

**Files:**
- Create: `packages/agent-runtime/src/skills/api-design.ts`

- [ ] **Step 1: 写入 skill 定义**

```typescript
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
  defaultModel: {
    model: 'auto',
    temperature: 0.2,
  },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const featureName = input.featureName ?? '未知功能';
    const pages = Array.isArray(input.pages) ? input.pages : [];
    const entities = Array.isArray(input.entities) ? input.entities : [];
    const dataModel = input.dataModel as JsonObject | undefined;
    const dataEntities = dataModel?.entities as JsonObject[] | undefined ?? entities;

    const backendFramework = (ctx.resolvedTargetProfile as JsonObject)?.backend
      ? ((ctx.resolvedTargetProfile as JsonObject).backend as JsonObject)?.framework ?? 'nestjs'
      : 'nestjs';

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
    return {
      basePath: String(raw.basePath ?? '/api/v1'),
      auth: String(raw.auth ?? 'jwt'),
      endpoints: Array.isArray(raw.endpoints) ? raw.endpoints.map((ep: JsonObject) => ({
        method: String(ep.method ?? 'GET').toUpperCase(),
        path: String(ep.path ?? '/'),
        summary: String(ep.summary ?? ''),
        auth: ep.auth !== false,
        request: ep.request ?? {},
        response: ep.response ?? {},
        errors: Array.isArray(ep.errors) ? ep.errors : [],
      })) : [],
    };
  },
};
```

- [ ] **Step 2: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add packages/agent-runtime/src/skills/api-design.ts
git commit -m "feat(skills): add api-design skill for RESTful API contract generation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3.3: 创建 backend-coding skill

**Files:**
- Create: `packages/agent-runtime/src/skills/backend-coding.ts`

- [ ] **Step 1: 写入 skill 定义**

```typescript
/**
 * Skill: backend-coding
 *
 * 基于 ApiContract + DataModel + TargetProfile，生成后端代码。
 * 支持 NestJS (TypeScript)、FastAPI (Python)、Gin (Go) 三种框架。
 */

import type { JsonObject } from '../../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../../skill-sdk/src';

export const backendCodingSkill: SkillDefinition = {
  name: 'backend-coding',
  version: '0.1.0',
  description: '根据 API 契约和数据模型生成后端代码',
  inputSchema: { name: 'api-contract' },
  outputSchema: { name: 'generation-report' },
  defaultModel: {
    model: 'auto',
    temperature: 0.1,
  },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const apiContract = input.apiContract ?? input;
    const dataModel = input.dataModel as JsonObject | undefined;
    const entities = dataModel?.entities as JsonObject[] | undefined ?? [];

    const backend = (ctx.resolvedTargetProfile as JsonObject)?.backend as JsonObject | undefined;
    const framework = backend?.framework ?? 'nestjs';
    const language = backend?.language ?? 'typescript';
    const orm = backend?.orm ?? 'prisma';

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

    return {
      system: `你是一个${framework} 后端开发专家。请根据 API 契约生成完整的后端代码。

${frameworkGuidance[framework] ?? frameworkGuidance.nestjs}

输出格式：
{
  "generatedFiles": [
    { "path": "api/src/...", "kind": "controller|service|module|dto|model|migration", "content": "// 完整的源代码" }
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
    return {
      generatedFiles: Array.isArray(raw.generatedFiles) ? raw.generatedFiles.map((f: JsonObject) => ({
        path: String(f.path ?? ''),
        kind: String(f.kind ?? 'module'),
        content: String(f.content ?? ''),
      })) : [],
      notes: Array.isArray(raw.notes) ? raw.notes : [],
    };
  },
};
```

- [ ] **Step 2: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add packages/agent-runtime/src/skills/backend-coding.ts
git commit -m "feat(skills): add backend-coding skill for NestJS/FastAPI/Gin code generation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3.4: 创建 deployment-planning skill

**Files:**
- Create: `packages/agent-runtime/src/skills/deployment-planning.ts`

- [ ] **Step 1: 写入 skill 定义**

```typescript
/**
 * Skill: deployment-planning
 *
 * 基于项目骨架、代码结构，生成 Dockerfile、docker-compose、Nginx 配置。
 */

import type { JsonObject } from '../../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../../skill-sdk/src';

export const deploymentPlanningSkill: SkillDefinition = {
  name: 'deployment-planning',
  version: '0.1.0',
  description: '生成 Docker + Nginx + Compose 部署配置',
  inputSchema: { name: 'project-scaffold' },
  outputSchema: { name: 'deployment-config' },
  defaultModel: {
    model: 'auto',
    temperature: 0.1,
  },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const featureName = input.featureName ?? 'app';
    const appName = featureName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const backendPort = (input.backendPort as number) ?? 3000;
    const frontendPort = (input.frontendPort as number) ?? 80;
    const dbType = (input.recommendedDb as string) ?? 'postgresql';
    const deployment = (ctx.resolvedTargetProfile as JsonObject)?.deployment as JsonObject | undefined;
    const strategy = deployment?.strategy ?? 'docker-compose';

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
    return {
      generatedFiles: Array.isArray(raw.generatedFiles) ? raw.generatedFiles.map((f: JsonObject) => ({
        path: String(f.path ?? ''),
        kind: String(f.kind ?? 'file'),
        content: String(f.content ?? ''),
      })) : [],
      notes: Array.isArray(raw.notes) ? raw.notes : [],
    };
  },
};
```

- [ ] **Step 2: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add packages/agent-runtime/src/skills/deployment-planning.ts
git commit -m "feat(skills): add deployment-planning skill for Docker/Nginx/Compose generation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3.5: 注册新 skills 并重构命名

**Files:**
- Modify: `packages/agent-runtime/src/index.ts`
- Modify: `packages/agent-runtime/src/skills/code-generation.ts` → 内部导出名调整（保留文件，以免破坏现有引用）

- [ ] **Step 1: 在 index.ts 中注册 4 个新 skill**

在 `packages/agent-runtime/src/index.ts` 的 import 区域追加：

```typescript
// New fullstack skills
import { dataModelingSkill } from './skills/data-modeling';
import { apiDesignSkill } from './skills/api-design';
import { backendCodingSkill } from './skills/backend-coding';
import { deploymentPlanningSkill } from './skills/deployment-planning';
```

在 `skillRegistry` 对象中追加：

```typescript
  // Fullstack skills
  'data-modeling': dataModelingSkill,
  'api-design': apiDesignSkill,
  'backend-coding': backendCodingSkill,
  'deployment-planning': deploymentPlanningSkill,
```

在文件末尾 export 区域追加：

```typescript
export { dataModelingSkill } from './skills/data-modeling';
export { apiDesignSkill } from './skills/api-design';
export { backendCodingSkill } from './skills/backend-coding';
export { deploymentPlanningSkill } from './skills/deployment-planning';
```

- [ ] **Step 2: 验证类型检查和 skill 注册**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add packages/agent-runtime/src/index.ts
git commit -m "feat(agent-runtime): register 4 new fullstack skills in skill registry

Add data-modeling, api-design, backend-coding, deployment-planning skills.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 4: 新增 Plugins

### Task 4.1: 创建 api-scaffold plugin

**Files:**
- Create: `plugins/api-scaffold/README.md`
- Create: `plugins/api-scaffold/package.json`
- Create: `plugins/api-scaffold/src/index.ts`

- [ ] **Step 1: 写入 plugin 文件**

`plugins/api-scaffold/package.json`:
```json
{
  "name": "@ai-frontend-engineering-agent/plugin-api-scaffold",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {},
  "dependencies": {}
}
```

`plugins/api-scaffold/src/index.ts`:
```typescript
/**
 * Plugin: api-scaffold
 *
 * 根据 ApiContract + TargetProfile，生成后端项目脚手架目录结构和入口文件。
 * 确定性执行 —— 不需要 LLM。
 */

import type { JsonObject } from '../../../packages/shared-types/src';

export interface ScaffoldOptions {
  /** 目标目录 */
  targetDir: string;
  /** API 契约 */
  apiContract: JsonObject;
  /** 后端 profile */
  backendProfile: { framework: string; language: string; orm?: string };
}

export interface ScaffoldResult {
  ok: boolean;
  directories: string[];
  entryFiles: Array<{ path: string; content: string }>;
  error?: string;
}

const SCAFFOLD_TEMPLATES: Record<string, { dirs: string[]; files: Array<{ path: string; content: string }> }> = {
  nestjs: {
    dirs: ['src', 'src/modules', 'src/common', 'src/prisma', 'prisma', 'test'],
    files: [
      {
        path: 'src/main.ts',
        content: `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors();
  await app.listen(process.env.API_PORT ?? 3000);
}
bootstrap();`,
      },
      {
        path: 'src/app.module.ts',
        content: `import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [],
  providers: [],
})
export class AppModule {}`,
      },
      {
        path: 'src/prisma/prisma.module.ts',
        content: `import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}`,
      },
      {
        path: 'src/prisma/prisma.service.ts',
        content: `import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}`,
      },
    ],
  },

  fastapi: {
    dirs: ['app', 'app/routers', 'app/models', 'app/schemas', 'app/core', 'migrations', 'tests'],
    files: [
      {
        path: 'app/main.py',
        content: `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/v1/health")
def health():
    return {"status": "ok"}`,
      },
    ],
  },

  gin: {
    dirs: ['cmd', 'internal', 'internal/handler', 'internal/model', 'internal/middleware', 'migrations'],
    files: [
      {
        path: 'cmd/main.go',
        content: `package main

import (
    "github.com/gin-gonic/gin"
)

func main() {
    r := gin.Default()
    r.GET("/api/v1/health", func(c *gin.Context) {
        c.JSON(200, gin.H{"status": "ok"})
    })
    r.Run(":3000")
}`,
      },
    ],
  },
};

export function scaffoldApi(options: ScaffoldOptions): ScaffoldResult {
  const { framework } = options.backendProfile;
  const template = SCAFFOLD_TEMPLATES[framework];

  if (!template) {
    return {
      ok: false,
      directories: [],
      entryFiles: [],
      error: `Unsupported backend framework: ${framework}. Supported: ${Object.keys(SCAFFOLD_TEMPLATES).join(', ')}`,
    };
  }

  // Prepend targetDir to all paths
  const directories = template.dirs.map(d => `${options.targetDir}/${d}`);
  const entryFiles = template.files.map(f => ({
    path: `${options.targetDir}/${f.path}`,
    content: f.content,
  }));

  return { ok: true, directories, entryFiles };
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add plugins/api-scaffold/
git commit -m "feat(plugins): add api-scaffold plugin for NestJS/FastAPI/Gin project scaffolding

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4.2: 创建 db-migration plugin

**Files:**
- Create: `plugins/db-migration/package.json`
- Create: `plugins/db-migration/src/index.ts`

- [ ] **Step 1: 写入 plugin**

`plugins/db-migration/package.json`:
```json
{
  "name": "@ai-frontend-engineering-agent/plugin-db-migration",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {},
  "dependencies": {}
}
```

`plugins/db-migration/src/index.ts`:
```typescript
/**
 * Plugin: db-migration
 *
 * 根据 DataModel 生成 ORM schema (Prisma) 和 SQL 迁移脚本。
 * 确定性执行 —— 从 DataModel 实体结构直接生成。
 */

import type { JsonObject } from '../../../packages/shared-types/src';

interface EntityField {
  name: string;
  type: string;
  primary?: boolean;
  unique?: boolean;
  nullable?: boolean;
  default?: unknown;
  values?: string[];
}

interface EntityRelation {
  kind: string;
  target: string;
  foreignKey: string;
}

interface Entity {
  name: string;
  fields: EntityField[];
  relations?: EntityRelation[];
}

export interface MigrationResult {
  ok: boolean;
  prismaSchema?: string;
  sqlMigrations?: Array<{ name: string; sql: string }>;
  error?: string;
}

function mapToPrismaType(field: EntityField): string {
  const map: Record<string, string> = {
    uuid: 'String @id @default(uuid())',
    string: 'String',
    number: 'Int',
    boolean: 'Boolean',
    date: 'DateTime',
    datetime: 'DateTime',
    text: 'String @db.Text',
    json: 'Json',
    enum: 'Enum?',
  };
  return map[field.type] ?? 'String';
}

function generatePrismaSchema(entities: Entity[], dbType: string): string {
  const datasource = dbType === 'sqlite'
    ? `datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}`
    : `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}`;

  const generator = `generator client {
  provider = "prisma-client-js"
}`;

  const models: string[] = [];

  for (const entity of entities) {
    const lines: string[] = [`model ${entity.name} {`];

    for (const field of entity.fields) {
      const attrs: string[] = [];
      if (field.primary) attrs.push('@id');
      if (field.type === 'uuid' && field.primary) {
        lines.push(`  ${field.name} String @id @default(uuid())`);
        continue;
      }
      let typeStr = mapToPrismaType(field);
      if (field.unique) attrs.push('@unique');
      if (!field.nullable && !field.primary) attrs.push('');
      const nullable = field.nullable || field.primary ? '' : '';
      if (field.default !== undefined) {
        attrs.push(`@default(${JSON.stringify(field.default)})`);
      }
      const attrStr = attrs.filter(Boolean).join(' ');
      lines.push(`  ${field.name} ${typeStr}${nullable ? '?' : ''} ${attrStr}`.trimEnd());
    }

    // Relations
    for (const rel of (entity.relations ?? [])) {
      const targetLower = rel.target.charAt(0).toLowerCase() + rel.target.slice(1);
      if (rel.kind === 'hasMany') {
        lines.push(`  ${targetLower}s ${rel.target}[]`);
      } else if (rel.kind === 'belongsTo') {
        lines.push(`  ${rel.foreignKey} String`);
        lines.push(`  ${targetLower} ${rel.target} @relation(fields: [${rel.foreignKey}], references: [id])`);
      }
    }

    lines.push('}\n');
    models.push(lines.join('\n'));
  }

  return `${datasource}\n${generator}\n${models.join('\n')}`;
}

function generateSqlMigration(entities: Entity[], dbType: string): string {
  const tables: string[] = [];

  for (const entity of entities) {
    const cols: string[] = [];
    for (const field of entity.fields) {
      let sqlType = 'TEXT';
      if (field.type === 'number') sqlType = 'INTEGER';
      else if (field.type === 'boolean') sqlType = 'BOOLEAN';
      else if (field.type === 'date' || field.type === 'datetime') sqlType = 'TIMESTAMP';
      else if (field.type === 'json') sqlType = 'JSONB';

      const constraints: string[] = [];
      if (field.primary) constraints.push('PRIMARY KEY');
      if (!field.nullable && !field.primary) constraints.push('NOT NULL');
      if (field.unique) constraints.push('UNIQUE');

      cols.push(`  "${field.name}" ${sqlType} ${constraints.join(' ')}`.trimEnd());
    }
    tables.push(`CREATE TABLE "${entity.name}" (\n${cols.join(',\n')}\n);`);
  }

  return tables.join('\n\n');
}

export function generateMigration(input: {
  entities: Entity[];
  recommendedDb: string;
}): MigrationResult {
  try {
    const { entities, recommendedDb } = input;

    if (!entities?.length) {
      return { ok: false, error: 'No entities provided' };
    }

    const prismaSchema = generatePrismaSchema(entities, recommendedDb);
    const sql = generateSqlMigration(entities, recommendedDb);

    return {
      ok: true,
      prismaSchema,
      sqlMigrations: [{
        name: '001_initial_schema',
        sql,
      }],
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add plugins/db-migration/
git commit -m "feat(plugins): add db-migration plugin for Prisma schema + SQL generation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4.3: 创建 docker-generator plugin

**Files:**
- Create: `plugins/docker-generator/package.json`
- Create: `plugins/docker-generator/src/index.ts`

- [ ] **Step 1: 写入 plugin**

`plugins/docker-generator/package.json`:
```json
{
  "name": "@ai-frontend-engineering-agent/plugin-docker-generator",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {},
  "dependencies": {}
}
```

`plugins/docker-generator/src/index.ts`:
```typescript
/**
 * Plugin: docker-generator
 *
 * 根据 DeploymentConfig 生成 Dockerfile、docker-compose.yml、Nginx 配置。
 * 确定性模板生成 —— 不依赖 LLM。
 */

import type { JsonObject } from '../../../packages/shared-types/src';

export interface DockerGenInput {
  appName: string;
  backendPort: number;
  frontendPort: number;
  dbType: string;
  services: string[];
}

export interface DockerGenResult {
  ok: boolean;
  files: Array<{ path: string; content: string }>;
}

const TEMPLATES = {
  dockerfileApi: (appName: string) => `# ─── API Service ───
FROM node:22-alpine AS builder
WORKDIR /app
COPY api/package*.json api/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY api/ ./
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]`,

  dockerfileWeb: `# ─── Web Service (Nginx) ───
FROM node:22-alpine AS builder
WORKDIR /app
COPY web/package*.json web/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`,

  dockerCompose: (appName: string, dbType: string) => `version: '3.8'

services:
  nginx:
    build:
      context: .
      dockerfile: deploy/Dockerfile.web
    ports:
      - "80:80"
    depends_on:
      api:
        condition: service_healthy
    networks:
      - ${appName}-net

  api:
    build:
      context: .
      dockerfile: deploy/Dockerfile.api
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=\${DATABASE_URL}
      - JWT_SECRET=\${JWT_SECRET}
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - ${appName}-net

  db:
    image: ${dbType}:alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: \${DB_USER}
      POSTGRES_PASSWORD: \${DB_PASSWORD}
      POSTGRES_DB: \${DB_NAME}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "\${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - ${appName}-net

volumes:
  pgdata:

networks:
  ${appName}-net:
    driver: bridge`,

  nginxConf: `server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE / WebSocket proxy (for real-time features)
    location /events/ {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}`,

  envExample: (appName: string) => `# ${appName} — Environment Variables
# Copy this to .env and fill in your values

# Database
DATABASE_URL=postgresql://studio:studio2026@db:5432/${appName}
DB_USER=studio
DB_PASSWORD=studio2026
DB_NAME=${appName}

# JWT
JWT_SECRET=change-me-to-a-random-string

# API
API_PORT=3000
NODE_ENV=production`,
};

export function generateDocker(input: DockerGenInput): DockerGenResult {
  const { appName, dbType } = input;

  const files = [
    { path: 'deploy/Dockerfile.api', content: TEMPLATES.dockerfileApi(appName) },
    { path: 'deploy/Dockerfile.web', content: TEMPLATES.dockerfileWeb },
    { path: 'deploy/docker-compose.yml', content: TEMPLATES.dockerCompose(appName, dbType) },
    { path: 'deploy/nginx/default.conf', content: TEMPLATES.nginxConf },
    { path: 'deploy/.env.example', content: TEMPLATES.envExample(appName) },
  ];

  return { ok: true, files };
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add plugins/docker-generator/
git commit -m "feat(plugins): add docker-generator plugin for Docker/Nginx/Compose templates

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4.4: 创建 api-contract-validator plugin

**Files:**
- Create: `plugins/api-contract-validator/package.json`
- Create: `plugins/api-contract-validator/src/index.ts`

- [ ] **Step 1: 写入 plugin**

`plugins/api-contract-validator/package.json`:
```json
{
  "name": "@ai-frontend-engineering-agent/plugin-api-contract-validator",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {},
  "dependencies": {}
}
```

`plugins/api-contract-validator/src/index.ts`:
```typescript
/**
 * Plugin: api-contract-validator
 *
 * 静态校验生成的后端代码是否匹配 ApiContract。
 * 检查：端点是否全部实现、请求/响应类型是否一致。
 */

import type { JsonObject } from '../../../packages/shared-types/src';

export interface ValidationInput {
  apiContract: JsonObject;
  generatedFiles: Array<{ path: string; content: string }>;
}

export interface ValidationOutput {
  ok: boolean;
  issues: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    endpoint?: string;
    message: string;
  }>;
}

export function validateApiContract(input: ValidationInput): ValidationOutput {
  const issues: ValidationOutput['issues'] = [];
  const endpoints = (input.apiContract.endpoints as JsonObject[]) ?? [];

  // Aggregate all source code
  const allSourceCode = input.generatedFiles
    .filter(f => f.path.endsWith('.ts') || f.path.endsWith('.py') || f.path.endsWith('.go'))
    .map(f => f.content)
    .join('\n');

  for (const ep of endpoints) {
    const method = String(ep.method ?? '').toUpperCase();
    const path = String(ep.path ?? '');

    // Check if endpoint path appears somewhere in the source
    // For NestJS: @Get('/path'), @Post('/path'), etc.
    // For FastAPI: @app.get('/path'), @router.get('/path')
    // For Gin: r.GET('/path'), group.GET('/path')
    const pathPattern = escapeRegex(path);
    const routePatterns = {
      GET: [/@Get\(['"`]\s*${pathPattern}/, /\.get\(['"`]\s*${pathPattern}/i, /\.GET\(['"`]\s*${pathPattern}/],
      POST: [/@Post\(['"`]\s*${pathPattern}/, /\.post\(['"`]\s*${pathPattern}/i, /\.POST\(['"`]\s*${pathPattern}/],
      PUT: [/@Put\(['"`]\s*${pathPattern}/, /\.put\(['"`]\s*${pathPattern}/i, /\.PUT\(['"`]\s*${pathPattern}/],
      PATCH: [/@Patch\(['"`]\s*${pathPattern}/, /\.patch\(['"`]\s*${pathPattern}/i, /\.PATCH\(['"`]\s*${pathPattern}/],
      DELETE: [/@Delete\(['"`]\s*${pathPattern}/, /\.delete\(['"`]\s*${pathPattern}/i, /\.DELETE\(['"`]\s*${pathPattern}/],
    };

    const patterns = routePatterns[method] ?? [];
    const found = patterns.some(p => p.test(allSourceCode));

    if (!found) {
      issues.push({
        severity: 'high',
        endpoint: `${method} ${path}`,
        message: `API contract endpoint ${method} ${path} not found in generated source code`,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add plugins/api-contract-validator/
git commit -m "feat(plugins): add api-contract-validator for endpoint coverage validation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 5: Validation 扩展

### Task 5.1: 扩展 validation-core 类型

**Files:**
- Modify: `packages/validation-core/src/types.ts`

- [ ] **Step 1: 新增后端验证类型**

在现有类型后追加：

```typescript
// packages/validation-core/src/types.ts — 追加内容

/** API 契约校验结果 */
export interface ApiContractValidationResult {
  passed: boolean;
  totalEndpoints: number;
  matchedEndpoints: number;
  missingEndpoints: string[];
  typeMismatches: Array<{ endpoint: string; field: string; expected: string; actual: string }>;
}

/** DB 迁移校验结果 */
export interface DbMigrationValidationResult {
  passed: boolean;
  migrationCount: number;
  canApply: boolean;
  errors: string[];
}

/** 集成测试结果 */
export interface IntegrationTestResult {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  failures: Array<{ test: string; error: string }>;
}

/** 部署可用性校验结果 */
export interface DeploymentValidationResult {
  passed: boolean;
  services: Array<{ name: string; healthy: boolean; url?: string }>;
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add packages/validation-core/src/types.ts
git commit -m "feat(validation-core): add API/DB/integration/deployment validation types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5.2: 导出新类型并更新 index

**Files:**
- Modify: `packages/validation-core/src/index.ts`

- [ ] **Step 1: 追加导出**

在现有导出后追加：

```typescript
export type {
  ApiContractValidationResult,
  DbMigrationValidationResult,
  IntegrationTestResult,
  DeploymentValidationResult,
} from './types';
```

- [ ] **Step 2: 验证类型检查**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add packages/validation-core/src/index.ts
git commit -m "feat(validation-core): export new validation types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 6: DataView 监控与回溯模块

### Task 6.1: 创建 ProjectMetrics 持久化

**Files:**
- Create: `packages/persistence/src/metrics.ts`

- [ ] **Step 1: 写入 metrics 存储类**

```typescript
/**
 * Project Metrics Store — PostgreSQL-backed project generation metrics
 */

import { query, queryOne, queryAll } from './store.js';

export interface StageMetric {
  stage: string;           // data-modeling, api-design, backend-coding, etc.
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  summary?: string;        // e.g. "6 实体, 3 关系"
}

export interface ArtifactStats {
  fileCount: number;
  totalLines: number;
  framework?: string;
}

export interface ProjectMetrics {
  projectId: string;
  sessionId?: string;
  profile: { frontend: string; backend: string; database: string };
  stages: StageMetric[];
  artifacts: {
    frontend: ArtifactStats;
    backend: ArtifactStats;
    database: ArtifactStats;
    deployment: ArtifactStats;
  };
  quality: {
    lintErrors: number;
    typeErrors: number;
    testPassed: number;
    testFailed: number;
  };
  timings: { start: number; end?: number };
  status: 'running' | 'completed' | 'failed';
}

function rowToMetrics(row: Record<string, unknown>): ProjectMetrics {
  return {
    projectId: row.project_id as string,
    sessionId: row.session_id as string | undefined,
    profile: typeof row.profile === 'string' ? JSON.parse(row.profile as string) : row.profile as ProjectMetrics['profile'],
    stages: typeof row.stages === 'string' ? JSON.parse(row.stages as string) : row.stages as StageMetric[],
    artifacts: typeof row.artifacts === 'string' ? JSON.parse(row.artifacts as string) : row.artifacts as ProjectMetrics['artifacts'],
    quality: typeof row.quality === 'string' ? JSON.parse(row.quality as string) : row.quality as ProjectMetrics['quality'],
    timings: typeof row.timings === 'string' ? JSON.parse(row.timings as string) : row.timings as ProjectMetrics['timings'],
    status: row.status as ProjectMetrics['status'],
  };
}

export class MetricsStore {
  async ensureTable(): Promise<void> {
    await query(`
      CREATE TABLE IF NOT EXISTS project_metrics (
        project_id TEXT PRIMARY KEY,
        session_id TEXT,
        profile JSONB NOT NULL DEFAULT '{}',
        stages JSONB NOT NULL DEFAULT '[]',
        artifacts JSONB NOT NULL DEFAULT '{}',
        quality JSONB NOT NULL DEFAULT '{}',
        timings JSONB NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'running',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async create(projectId: string, metrics: Omit<ProjectMetrics, 'projectId'>): Promise<ProjectMetrics> {
    const m: ProjectMetrics = { projectId, ...metrics };
    await query(
      `INSERT INTO project_metrics (project_id, session_id, profile, stages, artifacts, quality, timings, status)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8)
       ON CONFLICT (project_id) DO UPDATE SET
         stages = $4::jsonb, artifacts = $5::jsonb, quality = $6::jsonb, timings = $7::jsonb, status = $8, updated_at = NOW()`,
      [projectId, m.sessionId ?? null, JSON.stringify(m.profile), JSON.stringify(m.stages),
       JSON.stringify(m.artifacts), JSON.stringify(m.quality), JSON.stringify(m.timings), m.status]
    );
    return m;
  }

  async get(projectId: string): Promise<ProjectMetrics | undefined> {
    const row = await queryOne('SELECT * FROM project_metrics WHERE project_id = $1', [projectId]);
    return row ? rowToMetrics(row) : undefined;
  }

  async list(limit: number = 20): Promise<ProjectMetrics[]> {
    const rows = await queryAll('SELECT * FROM project_metrics ORDER BY created_at DESC LIMIT $1', [limit]);
    return rows.map(rowToMetrics);
  }

  async updateStage(projectId: string, stage: StageMetric): Promise<void> {
    const m = await this.get(projectId);
    if (!m) return;

    const idx = m.stages.findIndex(s => s.stage === stage.stage);
    if (idx >= 0) {
      m.stages[idx] = { ...m.stages[idx], ...stage };
    } else {
      m.stages.push(stage);
    }

    await query(
      `UPDATE project_metrics SET stages = $2::jsonb, updated_at = NOW() WHERE project_id = $1`,
      [projectId, JSON.stringify(m.stages)]
    );
  }

  async update(projectId: string, patch: Partial<ProjectMetrics>): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (patch.status) { sets.push(`status = $${idx++}`); values.push(patch.status); }
    if (patch.stages) { sets.push(`stages = $${idx++}::jsonb`); values.push(JSON.stringify(patch.stages)); }
    if (patch.artifacts) { sets.push(`artifacts = $${idx++}::jsonb`); values.push(JSON.stringify(patch.artifacts)); }
    if (patch.quality) { sets.push(`quality = $${idx++}::jsonb`); values.push(JSON.stringify(patch.quality)); }
    if (patch.timings) { sets.push(`timings = $${idx++}::jsonb`); values.push(JSON.stringify(patch.timings)); }

    if (sets.length === 0) return;
    values.push(projectId);
    await query(`UPDATE project_metrics SET ${sets.join(', ')}, updated_at = NOW() WHERE project_id = $${idx}`, values);
  }

  async overview(): Promise<{
    totalProjects: number;
    successRate: number;
    avgDuration: number;
    avgFiles: number;
    commonFailures: Array<{ stage: string; count: number }>;
  }> {
    const rows = await queryAll('SELECT * FROM project_metrics WHERE status != $1', ['running']);
    const total = rows.length;
    const completed = rows.filter(r => r.status === 'completed').length;
    const totalDuration = rows.reduce((sum, r) => {
      const timings = typeof r.timings === 'string' ? JSON.parse(r.timings as string) : r.timings;
      const dur = (timings as Record<string, number>).end ? (timings as Record<string, number>).end - (timings as Record<string, number>).start : 0;
      return sum + dur;
    }, 0);

    const totalFiles = rows.reduce((sum, r) => {
      const artifacts = typeof r.artifacts === 'string' ? JSON.parse(r.artifacts as string) : r.artifacts;
      const a = artifacts as Record<string, { fileCount?: number }>;
      return sum + (a.frontend?.fileCount ?? 0) + (a.backend?.fileCount ?? 0) + (a.database?.fileCount ?? 0) + (a.deployment?.fileCount ?? 0);
    }, 0);

    // Count common failures by stage
    const failureCounts = new Map<string, number>();
    for (const row of rows.filter(r => r.status === 'failed')) {
      const stages = typeof row.stages === 'string' ? JSON.parse(row.stages as string) : row.stages;
      for (const s of (stages as StageMetric[])) {
        if (s.status === 'failed') {
          failureCounts.set(s.stage, (failureCounts.get(s.stage) ?? 0) + 1);
        }
      }
    }

    return {
      totalProjects: total,
      successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      avgDuration: total > 0 ? Math.round(totalDuration / total) : 0,
      avgFiles: total > 0 ? Math.round(totalFiles / total) : 0,
      commonFailures: [...failureCounts.entries()]
        .map(([stage, count]) => ({ stage, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  }
}
```

- [ ] **Step 2: 在 persistence/index.ts 中导出**

```typescript
// packages/persistence/src/index.ts — 追加
export { MetricsStore, type ProjectMetrics, type StageMetric, type ArtifactStats } from './metrics.js';
```

- [ ] **Step 3: 在 server.ts 启动时建表**

在 `apps/studio-api/src/server.ts` 的 store 初始化区域追加：

```typescript
import { MetricsStore } from '@ai-frontend-engineering-agent/persistence';

const metricsStore = new MetricsStore();
await metricsStore.ensureTable();
```

- [ ] **Step 4: 验证类型检查**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent && pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add packages/persistence/src/metrics.ts packages/persistence/src/index.ts apps/studio-api/src/server.ts
git commit -m "feat(persistence): add ProjectMetrics store for generation observability

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6.2: 添加 DataView API 端点

**Files:**
- Modify: `apps/studio-api/src/server.ts` (追加在 Artifact 端点之后)

- [ ] **Step 1: 添加 4 个 metrics 路由**

在 Artifact 端点之后（`app.listen` 调用之前）追加：

```typescript
// ─── Metrics / DataView endpoints ────────────────────────────────────────

// GET /api/metrics/projects — list all project metrics
app.get('/api/metrics/projects', async (_req, res) => {
  try {
    const list = await metricsStore.list(50);
    res.json(list.map(m => ({
      projectId: m.projectId,
      sessionId: m.sessionId,
      profile: m.profile,
      status: m.status,
      stageCount: m.stages.length,
      totalFiles:
        (m.artifacts.frontend?.fileCount ?? 0) +
        (m.artifacts.backend?.fileCount ?? 0) +
        (m.artifacts.database?.fileCount ?? 0) +
        (m.artifacts.deployment?.fileCount ?? 0),
      duration: m.timings.end ? m.timings.end - m.timings.start : undefined,
      start: m.timings.start,
    })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/metrics/projects/:id — single project detail
app.get('/api/metrics/projects/:id', async (req, res) => {
  try {
    const m = await metricsStore.get(req.params.id);
    if (!m) return res.status(404).json({ error: 'Project metrics not found' });
    res.json(m);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/metrics/overview — global stats
app.get('/api/metrics/overview', async (_req, res) => {
  try {
    const overview = await metricsStore.overview();
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/metrics/projects/:id/stages — stage detail
app.get('/api/metrics/projects/:id/stages', async (req, res) => {
  try {
    const m = await metricsStore.get(req.params.id);
    if (!m) return res.status(404).json({ error: 'Project metrics not found' });
    res.json(m.stages);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 2: 更新启动日志**

在 `app.listen` 之前的 console.log 区域追加：

```typescript
  console.log(`    GET  /api/metrics/projects`);
  console.log(`    GET  /api/metrics/projects/:id`);
  console.log(`    GET  /api/metrics/overview`);
  console.log(`    GET  /api/metrics/projects/:id/stages`);
```

- [ ] **Step 3: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add apps/studio-api/src/server.ts
git commit -m "feat(api): add DataView metrics endpoints for project observability

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6.3: 创建 DataView 前端面板

**Files:**
- Create: `apps/studio-web/src/hooks/useMetrics.ts`
- Create: `apps/studio-web/src/components/MetricsProgress.tsx`
- Create: `apps/studio-web/src/components/MetricsArtifacts.tsx`
- Create: `apps/studio-web/src/components/MetricsHistory.tsx`
- Create: `apps/studio-web/src/components/MetricsQuality.tsx`
- Create: `apps/studio-web/src/components/DataViewPanel.tsx`
- Modify: `apps/studio-web/src/components/Sidebar.tsx` (增加导航项)

- [ ] **Step 1: 创建 useMetrics hook**

`apps/studio-web/src/hooks/useMetrics.ts`:
```typescript
import { useState, useEffect, useCallback } from 'react';

const API = '/api';

export interface ProjectMetric {
  projectId: string;
  sessionId?: string;
  profile: { frontend: string; backend: string; database: string };
  status: 'running' | 'completed' | 'failed';
  stageCount: number;
  totalFiles: number;
  duration?: number;
  start: number;
}

export interface OverviewStats {
  totalProjects: number;
  successRate: number;
  avgDuration: number;
  avgFiles: number;
  commonFailures: Array<{ stage: string; count: number }>;
}

export interface StageDetail {
  stage: string;
  status: string;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  summary?: string;
}

export function useMetrics() {
  const [projects, setProjects] = useState<ProjectMetric[]>([]);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    const res = await fetch(`${API}/metrics/projects`);
    if (res.ok) setProjects(await res.json());
  }, []);

  const fetchOverview = useCallback(async () => {
    const res = await fetch(`${API}/metrics/overview`);
    if (res.ok) setOverview(await res.json());
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchProjects(), fetchOverview()]);
    setLoading(false);
  }, [fetchProjects, fetchOverview]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { projects, overview, loading, refresh: fetchAll };
}

export async function fetchProjectDetail(projectId: string) {
  const res = await fetch(`${API}/metrics/projects/${projectId}`);
  return res.ok ? res.json() : null;
}

export async function fetchProjectStages(projectId: string): Promise<StageDetail[]> {
  const res = await fetch(`${API}/metrics/projects/${projectId}/stages`);
  return res.ok ? res.json() : [];
}
```

- [ ] **Step 2: 创建 MetricsProgress 组件**

`apps/studio-web/src/components/MetricsProgress.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Chip } from '@heroui/react/chip';
import { ProgressBar } from '@heroui/react/progress-bar';
import { Text } from '@heroui/react/text';
import { CheckCircle2, Loader2, Clock, XCircle } from 'lucide-react';
import { fetchProjectStages, type StageDetail } from '../hooks/useMetrics';

interface Props {
  projectId: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  'interactive-requirement': '需求收集',
  'requirement-analysis': '需求分析',
  'target-profile-selection': 'Profile 选择',
  'data-modeling': '数据建模',
  'api-design': 'API 设计',
  'page-planning': '页面规划',
  'backend-coding': '后端代码',
  'frontend-coding': '前端代码',
  'design-generation': '设计稿',
  'deployment-planning': '部署配置',
};

function StageIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'running': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
    default: return <Clock className="w-4 h-4 text-gray-400" />;
  }
}

export function MetricsProgress({ projectId }: Props) {
  const [stages, setStages] = useState<StageDetail[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetchProjectStages(projectId).then(s => { setStages(s); setLoading(false); });
    const interval = setInterval(() => {
      fetchProjectStages(projectId).then(s => setStages(s));
    }, 2000);
    return () => clearInterval(interval);
  }, [projectId]);

  if (!projectId) {
    return <Text className="text-gray-400 p-8 text-center">选择一个项目查看进度</Text>;
  }

  if (loading && !stages.length) {
    return <div className="flex items-center gap-2 p-8"><Loader2 className="animate-spin" /> 加载中...</div>;
  }

  const completed = stages.filter(s => s.status === 'completed').length;
  const total = stages.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <Text className="font-semibold text-lg">生成进度</Text>
        <Chip size="sm" color={progress === 100 ? 'success' : 'primary'}>
          {progress}%
        </Chip>
      </div>
      <ProgressBar value={progress} className="mb-6" color={progress === 100 ? 'success' : 'primary'} />
      <div className="space-y-2">
        {stages.map(s => (
          <div key={s.stage} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <StageIcon status={s.status} />
            <span className="flex-1 text-sm font-medium">{STAGE_LABELS[s.stage] ?? s.stage}</span>
            {s.summary && <Chip size="sm" variant="flat">{s.summary}</Chip>}
            {s.duration && <span className="text-xs text-gray-400">{(s.duration / 1000).toFixed(1)}s</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 创建 MetricsQuality 组件**

`apps/studio-web/src/components/MetricsQuality.tsx`:
```tsx
import { Card, CardHeader, CardContent } from '@heroui/react/card';
import { Text } from '@heroui/react/text';
import { TrendingUp, Clock, FileCode, AlertTriangle } from 'lucide-react';
import type { OverviewStats } from '../hooks/useMetrics';

interface Props {
  overview: OverviewStats | null;
}

export function MetricsQuality({ overview }: Props) {
  if (!overview) return null;

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const stats = [
    { icon: <TrendingUp className="w-5 h-5" />, label: '成功率', value: `${overview.successRate}%`, color: overview.successRate >= 80 ? 'text-green-600' : 'text-yellow-600' },
    { icon: <Clock className="w-5 h-5" />, label: '平均耗时', value: formatDuration(overview.avgDuration), color: '' },
    { icon: <FileCode className="w-5 h-5" />, label: '平均文件数', value: `${overview.avgFiles}`, color: '' },
    { icon: <AlertTriangle className="w-5 h-5" />, label: '项目总数', value: `${overview.totalProjects}`, color: '' },
  ];

  return (
    <div className="p-4">
      <Text className="font-semibold text-lg mb-4">质量概览</Text>
      <div className="grid grid-cols-2 gap-3">
        {stats.map(s => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">{s.icon} <span className="text-xs">{s.label}</span></div>
            <Text className={`text-2xl font-bold ${s.color}`}>{s.value}</Text>
          </Card>
        ))}
      </div>

      {overview.commonFailures.length > 0 && (
        <div className="mt-6">
          <Text className="font-medium mb-2 text-sm text-gray-500">常见失败阶段</Text>
          <div className="space-y-2">
            {overview.commonFailures.map(f => (
              <div key={f.stage} className="flex justify-between text-sm">
                <span>{f.stage}</span>
                <span className="text-red-500">{f.count} 次</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 创建 MetricsArtifacts 组件**

`apps/studio-web/src/components/MetricsArtifacts.tsx`:
```tsx
import { Text } from '@heroui/react/text';
import { Code, Server, Database, Container } from 'lucide-react';
import type { ProjectMetric } from '../hooks/useMetrics';

interface Props {
  project: ProjectMetric | null;
}

export function MetricsArtifacts({ project }: Props) {
  if (!project) {
    return <Text className="text-gray-400 p-8 text-center">选择项目查看产物统计</Text>;
  }

  const items = [
    { icon: <Code className="w-4 h-4" />, label: '前端', framework: project.profile.frontend },
    { icon: <Server className="w-4 h-4" />, label: '后端', framework: project.profile.backend },
    { icon: <Database className="w-4 h-4" />, label: '数据库', framework: project.profile.database },
    { icon: <Container className="w-4 h-4" />, label: '部署', framework: 'Docker' },
  ];

  return (
    <div className="p-4">
      <Text className="font-semibold text-lg mb-4">产物统计</Text>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            {item.icon}
            <div>
              <Text className="text-sm font-medium">{item.label}</Text>
              <Text className="text-xs text-gray-500">{item.framework}</Text>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
        <Text className="text-sm">
          总文件: <strong>{project.totalFiles}</strong>
          {project.duration && <> · 耗时: <strong>{(project.duration / 1000).toFixed(1)}s</strong></>}
        </Text>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 创建 MetricsHistory 组件**

`apps/studio-web/src/components/MetricsHistory.tsx`:
```tsx
import { Chip } from '@heroui/react/chip';
import { Text } from '@heroui/react/text';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { ProjectMetric } from '../hooks/useMetrics';

interface Props {
  projects: ProjectMetric[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function StatusChip({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <Chip size="sm" color="success" startContent={<CheckCircle2 className="w-3 h-3" />}>完成</Chip>;
    case 'failed': return <Chip size="sm" color="danger" startContent={<XCircle className="w-3 h-3" />}>失败</Chip>;
    case 'running': return <Chip size="sm" color="primary" startContent={<Loader2 className="w-3 h-3 animate-spin" />}>运行中</Chip>;
    default: return <Chip size="sm">{status}</Chip>;
  }
}

export function MetricsHistory({ projects, selectedId, onSelect }: Props) {
  if (!projects.length) {
    return <Text className="text-gray-400 p-8 text-center">暂无生成记录</Text>;
  }

  return (
    <div className="p-4">
      <Text className="font-semibold text-lg mb-4">历史回溯</Text>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {projects.map(p => (
          <div
            key={p.projectId}
            className={`p-3 rounded-lg cursor-pointer transition-colors border ${
              selectedId === p.projectId
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-100 hover:border-gray-300 dark:border-gray-700'
            }`}
            onClick={() => onSelect(p.projectId)}
          >
            <div className="flex items-center justify-between mb-1">
              <Text className="font-medium text-sm truncate">{p.projectId}</Text>
              <StatusChip status={p.status} />
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{p.profile.frontend} + {p.profile.backend}</span>
              <span>{p.totalFiles} 文件</span>
              {p.duration && <span>{(p.duration / 1000).toFixed(1)}s</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 创建 DataViewPanel 主组件**

`apps/studio-web/src/components/DataViewPanel.tsx`:
```tsx
import { useState } from 'react';
import { Tabs, TabList, Tab, TabPanel } from '@heroui/react/tabs';
import { Spinner } from '@heroui/react/spinner';
import { Activity } from 'lucide-react';
import { useMetrics, fetchProjectDetail } from '../hooks/useMetrics';
import { MetricsProgress } from './MetricsProgress';
import { MetricsArtifacts } from './MetricsArtifacts';
import { MetricsHistory } from './MetricsHistory';
import { MetricsQuality } from './MetricsQuality';
import type { ProjectMetric } from '../hooks/useMetrics';

export function DataViewPanel() {
  const { projects, overview, loading, refresh } = useMetrics();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectMetric | null>(null);

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    const detail = await fetchProjectDetail(id);
    setSelectedProject(detail);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-gray-400">
        <Spinner size="lg" />
        <span className="mt-4">加载监控数据...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Activity className="w-5 h-5 text-blue-500" />
        <h2 className="text-lg font-semibold">DataView · 生成监控</h2>
        <button
          onClick={refresh}
          className="ml-auto text-sm text-blue-600 hover:text-blue-800"
        >
          刷新
        </button>
      </div>

      <Tabs className="flex-1 overflow-hidden">
        <TabList className="px-4 pt-2">
          <Tab>进度</Tab>
          <Tab>产物</Tab>
          <Tab>历史</Tab>
          <Tab>质量</Tab>
        </TabList>

        <div className="flex-1 overflow-y-auto">
          <TabPanel>
            <MetricsProgress projectId={selectedId} />
          </TabPanel>
          <TabPanel>
            <MetricsArtifacts project={selectedProject} />
          </TabPanel>
          <TabPanel>
            <MetricsHistory projects={projects} selectedId={selectedId} onSelect={handleSelect} />
          </TabPanel>
          <TabPanel>
            <MetricsQuality overview={overview} />
          </TabPanel>
        </div>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 7: 在 Sidebar 中添加 DataView 导航**

在 `apps/studio-web/src/components/Sidebar.tsx` 中：

找到 `NavKey` 类型定义，追加 `'dataview'`:
```typescript
type NavKey = 'chat' | 'workflows' | 'history' | 'dataview';
```

在导航按钮区域追加 DataView 按钮：
```tsx
<Tooltip>
  <TooltipTrigger as={Button} variant={activeNav === 'dataview' ? 'solid' : 'light'}
    onPress={() => onNavChange('dataview')}>
    <Activity className="w-5 h-5" />
  </TooltipTrigger>
  <TooltipContent>DataView · 监控</TooltipContent>
</Tooltip>
```

确保 `Activity` 已从 `lucide-react` 导入。

- [ ] **Step 8: 在 App.tsx 中添加 DataView 路由**

在 `apps/studio-web/src/App.tsx` 中：

导入 `DataViewPanel`:
```typescript
import { DataViewPanel } from './components/DataViewPanel';
```

在 `NavKey` 类型（如果有的话）或内容渲染区域添加 DataView case:
```tsx
{activeNav === 'dataview' && <DataViewPanel />}
```

- [ ] **Step 9: 验证前端编译**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent/apps/studio-web && npx tsc --noEmit 2>&1 | head -30
```

修复任何类型错误。

- [ ] **Step 10: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add apps/studio-web/src/hooks/useMetrics.ts \
        apps/studio-web/src/components/MetricsProgress.tsx \
        apps/studio-web/src/components/MetricsArtifacts.tsx \
        apps/studio-web/src/components/MetricsHistory.tsx \
        apps/studio-web/src/components/MetricsQuality.tsx \
        apps/studio-web/src/components/DataViewPanel.tsx \
        apps/studio-web/src/components/Sidebar.tsx \
        apps/studio-web/src/App.tsx
git commit -m "feat(studio-web): add DataView panel with 4 monitoring sub-views

Add progress tracking, artifact stats, history, and quality overview panels.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 7: Workflow YAML 更新

### Task 7.1: 创建全栈工作流 from-idea-to-fullstack

**Files:**
- Create: `workflows/from-idea-to-fullstack.yaml`

- [ ] **Step 1: 写入全栈工作流定义**

```yaml
id: from-idea-to-fullstack
name: From Idea To Fullstack Application
version: 0.3.0
description: 全栈项目生成工作流 — 从想法到可部署的全栈应用（前端+后端+数据库+部署）

input:
  schema: idea-input
  fields:
    - name: userMessage
      type: string
      required: true
    - name: conversationHistory
      type: array
      required: false
    - name: existingDocument
      type: object
      required: false

nodes:
  # ─── Phase 1: 需求与分析 ───
  - id: interactive_requirement
    type: agent
    name: 交互式需求收集
    skill: interactive-requirement
    outputSchema: requirement-spec

  - id: requirement_analysis
    type: agent
    name: 需求结构化
    skill: requirement-analysis
    dependsOn: [interactive_requirement]
    outputSchema: requirement-spec

  - id: target_profile_selection
    type: agent
    name: 全栈 Profile 选择
    skill: target-profile-selection
    dependsOn: [requirement_analysis]
    outputSchema: target-profile-selection

  # ─── Phase 2: 设计与建模 ───
  - id: data_modeling
    type: agent
    name: 数据建模
    skill: data-modeling
    dependsOn: [target_profile_selection]
    outputSchema: data-model

  - id: api_design
    type: agent
    name: API 设计
    skill: api-design
    dependsOn: [data_modeling]
    outputSchema: api-contract

  - id: page_planning
    type: agent
    name: 页面规划
    skill: page-planning
    dependsOn: [target_profile_selection]
    outputSchema: page-plan

  # ─── Phase 3: 代码生成 ───
  - id: backend_coding
    type: agent
    name: 后端代码生成
    skill: backend-coding
    dependsOn: [api_design]
    outputSchema: generation-report
    retryTarget: api_design
    maxRetries: 2

  - id: frontend_coding
    type: agent
    name: 前端代码生成
    skill: frontend-coding-core
    dependsOn: [page_planning, api_design]
    outputSchema: generation-report
    retryTarget: page_planning
    maxRetries: 2

  # ─── Phase 4: 插件执行 ───
  - id: db_migration
    type: plugin
    name: 数据库迁移生成
    plugin: db-migration
    dependsOn: [data_modeling]

  - id: api_scaffold
    type: plugin
    name: API 脚手架生成
    plugin: api-scaffold
    dependsOn: [api_design]

  - id: project_scanner
    type: plugin
    name: 项目结构扫描
    plugin: project-scanner
    dependsOn: [backend_coding, frontend_coding]

  - id: rule_checkers
    type: pluginGroup
    name: 规则检查
    plugins: [loading-checker, debounce-checker, confirm-checker, api-contract-validator]
    dependsOn: [project_scanner]

  # ─── Phase 5: 测试 ───
  - id: playwright_runner
    type: plugin
    name: E2E 冒烟测试
    plugin: playwright-runner
    dependsOn: [rule_checkers]
    when:
      allPassed: true

  - id: visual_regression
    type: plugin
    name: 视觉回归测试
    plugin: visual-regression-runner
    dependsOn: [playwright_runner]
    when:
      allPassed: true

  # ─── Phase 6: 部署 ───
  - id: deployment_planning
    type: agent
    name: 部署配置生成
    skill: deployment-planning
    dependsOn: [visual_regression]
    outputSchema: deployment-config

  - id: docker_gen
    type: plugin
    name: Docker 文件生成
    plugin: docker-generator
    dependsOn: [deployment_planning]

output:
  primaryFrom: docker_gen

approvalGates:
  - afterStage: data_modeling
    name: 数据模型审批
    required: true
  - afterStage: backend_coding
    name: 后端代码审批
    required: false
```

- [ ] **Step 2: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add workflows/from-idea-to-fullstack.yaml
git commit -m "feat(workflows): add from-idea-to-fullstack workflow for end-to-end fullstack generation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7.2: 更新 server.ts 注册新工作流插件映射

**Files:**
- Modify: `apps/studio-api/src/server.ts` (runPlugin 的 switch 块)

- [ ] **Step 1: 在 runPlugin switch 中添加新插件 case**

在 `runPlugin` 适配器的 switch 语句中追加：

```typescript
              case 'db-migration': {
                const { generateMigration } = await import('../../../plugins/db-migration/src/index.js');
                const dataModel = state.nodeResults['data_modeling']?.output;
                result = { ok: true, output: generateMigration({
                  entities: (dataModel as Record<string, unknown>)?.entities as Parameters<typeof generateMigration>[0]['entities'] ?? [],
                  recommendedDb: String((dataModel as Record<string, unknown>)?.recommendedDb ?? 'postgresql'),
                }) as unknown as JsonObject };
                break;
              }
              case 'api-scaffold': {
                const { scaffoldApi } = await import('../../../plugins/api-scaffold/src/index.js');
                result = { ok: true, output: scaffoldApi({
                  targetDir: state.context.targetProject ?? './generated',
                  apiContract: (state.nodeResults['api_design']?.output ?? {}) as JsonObject,
                  backendProfile: {
                    framework: ((state.context.resolvedTargetProfile as unknown as Record<string, unknown>)?.backend as Record<string, string>)?.framework ?? 'nestjs',
                    language: ((state.context.resolvedTargetProfile as unknown as Record<string, unknown>)?.backend as Record<string, string>)?.language ?? 'typescript',
                  },
                }) as unknown as JsonObject };
                break;
              }
              case 'docker-generator': {
                const { generateDocker } = await import('../../../plugins/docker-generator/src/index.js');
                result = { ok: true, output: generateDocker({
                  appName: 'generated-app',
                  backendPort: 3000,
                  frontendPort: 80,
                  dbType: 'postgresql',
                  services: ['nginx', 'api', 'db'],
                }) as unknown as JsonObject };
                break;
              }
              case 'api-contract-validator': {
                const { validateApiContract } = await import('../../../plugins/api-contract-validator/src/index.js');
                result = { ok: true, output: validateApiContract({
                  apiContract: (state.nodeResults['api_design']?.output ?? {}) as JsonObject,
                  generatedFiles: (state.nodeResults['backend_coding']?.output as Record<string, unknown>)?.generatedFiles as Array<{path: string; content: string}> ?? [],
                }) as unknown as JsonObject };
                break;
              }
```

- [ ] **Step 2: 验证类型检查**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd ~/CodeLab/ai-frontend-engineering-agent
git add apps/studio-api/src/server.ts
git commit -m "feat(api): register new plugins in workflow executor switch

Add db-migration, api-scaffold, docker-generator, api-contract-validator.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 验证清单

在所有 Phase 完成后，运行以下命令确认整体完整性：

```bash
cd ~/CodeLab/ai-frontend-engineering-agent

# 1. 全量类型检查
pnpm typecheck

# 2. 确认所有 schema 可加载
node -e "
const fs = require('fs');
const files = fs.readdirSync('contracts').filter(f => f.endsWith('.schema.json'));
console.log('Contracts:', files.length, 'schemas found');
for (const f of files) {
  const content = JSON.parse(fs.readFileSync('contracts/' + f, 'utf-8'));
  console.log('  -', content.title || f);
}
"

# 3. 确认所有 plugins 存在
for d in plugins/*/; do
  echo "Plugin: $(basename $d) — $(ls $d/src/index.ts 2>/dev/null && echo 'OK' || echo 'MISSING')"
done

# 4. 确认所有 skills 注册
node -e "
const { skillRegistry } = require('./packages/agent-runtime/dist/index.js') || {};
if (skillRegistry) {
  console.log('Skills registered:', Object.keys(skillRegistry).length);
  for (const [name] of Object.entries(skillRegistry)) {
    console.log('  -', name);
  }
} else {
  console.log('(Run pnpm typecheck first to build)');
}
"

# 5. 启动 Studio 验证运行时
pnpm studio:api &
sleep 2
echo "=== Health ===" && curl -s http://localhost:4401/api/health
echo ""
echo "=== Profiles ===" && curl -s http://localhost:4401/api/profiles | python3 -m json.tool 2>/dev/null | head -20
echo ""
echo "=== Workflows ===" && curl -s http://localhost:4401/api/workflows
kill %1
```
