# 全栈项目生成平台 — 架构重设计

> 从"前端工程生成"升级为"全栈 Web 应用生成平台"，覆盖前端、后端、数据库、部署四个维度。

## 1. 架构变更总览

### 1.1 核心变化

```
改前：只关注前端一条线
  需求 → 页面规划 → UI Contract → 前端代码 → 部署入口

改后：四条并行生成线，最后集成
  需求 → Profile 选择 (前端 + 后端 + 数据库)
    ├── 数据建模 → DB Schema → 迁移脚本
    ├── API 设计 → API Contract → 后端代码
    ├── 页面规划 → Page Plan → 前端代码
    └── 部署规划 → Docker/Nginx → 部署配置
    ↓
  集成验证 → E2E 测试 → 发布
```

### 1.2 目标形态

| 维度 | 支持范围 |
|------|---------|
| 前端 | Vue3/React 管理后台 + H5 + 微信小程序（保持现有） |
| 后端 | Node.js (NestJS/Express) / Python (FastAPI) / Go (Gin) |
| 数据库 | Agent 按项目需求自动推荐（PG/SQLite/MySQL），平台只定义规范接口 |
| 部署 | Docker + docker-compose + Nginx → 预留 K8s/Helm 扩展点 |

### 1.3 平台策略（保持）

平台层保持框架中立：
- `workflows/` — 流程编排
- `contracts/` — 结构化中间产物
- `policies/` — 通用规则与目标 profile
- `plugins/` — 确定性执行能力
- `packages/agent-runtime/src/skills/` — 受约束的推理和生成

---

## 2. Target Profile 扩展

### 2.1 新 Profile 结构

原来 profile 只描述前端，现在描述全栈项目形态。

```yaml
# 例：policies/targets/fullstack-vue3-nestjs.yaml
id: fullstack-vue3-nestjs
name: Vue3 管理后台 + NestJS 全栈

frontend:
  framework: vue3
  uiLib: element-plus
  routerMode: hash
  pagePatterns: [list, form, detail, dashboard]
  testing: [vitest, playwright]

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

### 2.2 Profile 维度组合

现有 5 个前端 profile × 3 个后端方向 → 按需组合：

- `vue3-admin` × `nestjs` / `fastapi` / `gin`
- `react-admin` × `nestjs` / `fastapi` / `gin`
- `pc-spa` × `nestjs` / `fastapi` / `gin`
- `h5-spa` × `nestjs` / `fastapi` / `gin`
- `wechat-miniapp` × `nestjs` / `fastapi` / `gin`

Profile 注册表支持按维度查询：

```
GET /api/profiles?frontend=vue3-admin&backend=nestjs → 匹配列表
```

---

## 3. Contracts 扩展

### 3.1 现有 Contracts（保持）

- `RequirementSpec` — 结构化需求
- `TargetProfileSelection` — profile 选择结果
- `PagePlan` — 页面规划
- `UIContract` — UI 交互契约
- `ImplementationPlan` — 实现方案
- `TestPlan` — 测试计划
- `ValidationReport` — 验证报告

### 3.2 新增 Contracts

#### DataModel

```json
{
  "entities": [
    {
      "name": "User",
      "fields": [
        { "name": "id", "type": "uuid", "primary": true },
        { "name": "email", "type": "string", "unique": true, "nullable": false },
        { "name": "role", "type": "enum", "values": ["admin", "user"] }
      ],
      "relations": [{ "kind": "hasMany", "target": "Post", "foreignKey": "authorId" }],
      "indexes": [{ "fields": ["email"], "unique": true }]
    }
  ],
  "recommendedDb": "postgresql",
  "reasoning": "多表关联 + 枚举类型，推荐 PostgreSQL"
}
```

#### ApiContract

```json
{
  "basePath": "/api/v1",
  "auth": "jwt",
  "endpoints": [
    {
      "method": "POST",
      "path": "/auth/login",
      "request": { "body": { "email": "string", "password": "string" } },
      "response": { "token": "string", "user": "User" },
      "errors": [401, 422]
    }
  ]
}
```

#### DeploymentConfig

```json
{
  "services": ["nginx", "api", "db"],
  "ports": { "api": 3000, "db": 5432, "nginx": 80 },
  "envVars": ["DATABASE_URL", "JWT_SECRET", "API_PORT"],
  "volumes": ["pgdata"],
  "healthChecks": { "api": "/api/health", "db": "pg_isready" }
}
```

#### ProjectScaffold

```json
{
  "structure": {
    "directories": ["src/", "api/", "migrations/", "deploy/", "tests/"],
    "entryPoints": {
      "frontend": "src/main.ts",
      "backend": "api/server.ts",
      "migrations": "migrations/"
    }
  },
  "packageManager": "pnpm",
  "monorepo": true,
  "packages": ["web", "api", "shared"]
}
```

---

## 4. Agent Runtime — Skills 调整

### 4.1 Skills 总览

| Skill | 职责 | 阶段 |
|-------|------|------|
| `interactive-requirement` | 多轮对话收集需求 | Phase 1 输入 |
| `requirement-analysis` | 聊天 → 结构化需求 + DataModel 线索 | Phase 1 分析 |
| `target-profile-selection` | 推荐前/后端/数据库 profile | Phase 1 分析 |
| `ui-library-selection` | 推荐 UI 组件库 | Phase 1 分析 |
| **`data-modeling`** 🆕 | 需求 → DataModel (实体/字段/关系) | Phase 2 设计 |
| **`api-design`** 🆕 | 需求 + DataModel → ApiContract | Phase 2 设计 |
| `page-planning` | 页面路由 + 权限规划 | Phase 2 设计 |
| **`backend-coding`** 🆕 | ApiContract + DataModel → 后端代码 | Phase 3 生成 |
| `frontend-coding` | PagePlan + ApiContract → 前端代码 | Phase 3 生成 |
| `design-generation` | HTML 设计稿（合并到 frontend-coding 流程） | Phase 3 生成 |
| **`deployment-planning`** 🆕 | 项目骨架 → DeploymentConfig + 部署文件 | Phase 3 生成 |

### 4.2 推荐执行流程

```
interactive-requirement
    ↓
requirement-analysis ──→ target-profile-selection
    ↓
data-modeling ──→ api-design
    ↓                  ↓
page-planning     backend-coding
    ↓                  ↓
frontend-coding ←──────┘
    ↓
deployment-planning
```

### 4.3 Skill 定义文件位置

```
packages/agent-runtime/src/skills/
  ├── interactive-requirement.ts   (现有)
  ├── requirement-analysis.ts      (现有)
  ├── target-profile-selection.ts  (现有)
  ├── ui-library-selection.ts      (现有)
  ├── data-modeling.ts             🆕
  ├── api-design.ts                🆕
  ├── page-planning.ts            (现有)
  ├── backend-coding.ts            🆕
  ├── frontend-coding.ts          (现有 code-generation → 重命名)
  ├── design-generation.ts        (现有)
  └── deployment-planning.ts       🆕
```

---

## 5. Plugin Runtime 扩展

### 5.1 现有 Plugins（保持）

- `project-scanner` — 扫描项目结构
- `navigation-decider` — 导航决策 → UIContract
- `page-generator` — 页面骨架生成
- `rule-checkers` — loading/debounce/删除确认规则
- `playwright-runner` — 诊断型（待升级）
- `visual-regression-runner` — 诊断型（待升级）

### 5.2 新增 Plugins

| Plugin | 类型 | 职责 |
|--------|------|------|
| **`api-scaffold`** 🆕 | plugin | 按 ApiContract + profile 生成后端项目骨架 |
| **`db-migration`** 🆕 | plugin | 按 DataModel 生成 ORM schema + 迁移 SQL |
| **`docker-generator`** 🆕 | plugin | 按 DeploymentConfig 生成 Dockerfile/compose/Nginx |
| **`api-contract-validator`** 🆕 | plugin | 校验生成的后端代码是否匹配 ApiContract |

---

## 6. Validation 扩展

### 6.1 现有验证（保持）

- lint / typecheck / 单测 / Playwright 冒烟 / 视觉回归 / 策略规则检查

### 6.2 新增验证维度

| 验证项 | 级别 | 说明 |
|--------|------|------|
| API 契约校验 | contract | 实际端点 & 响应是否匹配 ApiContract |
| DB 迁移校验 | migration | 迁移脚本是否可执行、是否与 DataModel 一致 |
| 集成测试 | e2e | 前后端联调、API → DB 链路通畅 |
| 部署可用性 | infra | docker-compose up 后服务健康检查通过 |

---

## 7. DataView 监控与回溯模块

### 7.1 定位

在 Studio Web 中新增 DataView 面板，提供项目生成的全流程可观测性。

### 7.2 四大子面板

#### 7.2.1 实时生成进度

```
┌─────────────────────────────────────────────┐
│ 项目: 电商后台系统      状态: 🟢 生成中      │
│ 耗时: 3m 42s           profile: vue3+nestjs │
├─────────────────────────────────────────────┤
│ ■ 需求分析        ✅ 2.1s                    │
│ ■ 数据建模        ✅ 15.3s  → 6 实体, 3 关系  │
│ ■ API 设计        ✅ 12.8s  → 14 端点         │
│ ■ 后端代码        ⏳ 进行中  NestJS 3/7 模块  │
│ ■ 前端代码        ⏸ 等待中                    │
│ ■ 部署配置        ⏸ 等待中                    │
│ ■ 集成验证        ⏸ 等待中                    │
├─────────────────────────────────────────────┤
│ ████████████░░░░░░░░ 52%                    │
└─────────────────────────────────────────────┘
```

#### 7.2.2 产物统计

```
┌──────────────────────────────────────────┐
│ 前端:   14 文件 / 1,820 行 / Vue3 + EL    │
│ 后端:   22 文件 / 2,410 行 / NestJS+Prisma│
│ 数据库:  3 迁移 / 6 表                    │
│ 部署:    4 文件 / Docker+Nginx+Compose    │
│ ────────────────────────────              │
│ 总计:   43 文件 / 4,230 行 / 5m 12s       │
└──────────────────────────────────────────┘
```

#### 7.2.3 历史回溯

- 项目列表（时间、名称、耗时、状态）
- 点击可查看完整中间产物链：RequirementSpec → DataModel → ApiContract → ...
- 支持按状态/时间筛选

#### 7.2.4 质量统计

- 成功率（最近 N 次）
- 平均耗时
- 平均文件数
- 常见失败原因分布

### 7.3 持久化

`packages/persistence/` 新增 `ProjectMetrics`:

```typescript
interface ProjectMetrics {
  projectId: string
  profile: { frontend: string; backend: string; database: string }
  stages: StageMetric[]
  artifacts: {
    frontend: FileStats
    backend: FileStats
    database: FileStats
    deployment: FileStats
  }
  quality: {
    lintErrors: number
    typeErrors: number
    testPassed: number
    testFailed: number
  }
  timings: { start: number; end?: number }
  status: 'running' | 'completed' | 'failed'
}
```

### 7.4 API 端点

```
GET  /api/metrics/projects              — 所有项目指标列表
GET  /api/metrics/projects/:id          — 单个项目详细指标
GET  /api/metrics/overview              — 全局统计概览
GET  /api/metrics/projects/:id/stages   — 阶段详情
```

---

## 8. 实施顺序

| 阶段 | 内容 | 优先级 |
|------|------|--------|
| **Phase 1** | Target Profile 扩展（yaml 结构 + 注册表 API） | 🔴 基础设施 |
| **Phase 2** | 新增 4 个 Contracts (schema + 注册) | 🔴 基础设施 |
| **Phase 3** | 新增 4 个 Skills (data-modeling/api-design/backend-coding/deployment-planning) | 🔴 核心生成 |
| **Phase 4** | 新增 4 个 Plugins (api-scaffold/db-migration/docker-generator/api-contract-validator) | 🔴 核心生成 |
| **Phase 5** | Validation 扩展 (API 契约校验/DB 迁移校验/集成测试) | 🟡 质量保障 |
| **Phase 6** | DataView 模块 (API + 前端四个面板) | 🟡 可视化 |
| **Phase 7** | Workflows YAML 更新 (from-idea-to-app 全栈流程) | 🟡 流程编排 |
| **Phase 8** | 现有 mock-validator 升级 + Playwright/VR Runner 真实化 | 🟢 质量深化 |
| **Phase 9** | DAG 并行执行 + 审批闸门前端 | 🟢 体验优化 |
| **Phase 10** | K8s/Helm 部署扩展 | ⚪ 远期 |

---

## 9. 与现有代码的关系

| 模块 | 改动类型 | 说明 |
|------|---------|------|
| `policies/targets/` | 扩展 | 5 个现有 profile yaml 增加 backend/database/deployment 字段 |
| `contracts/` | 新增 | 加 4 个 schema 文件 + 注册 |
| `packages/contract-schema/` | 扩展 | 注册新 schema |
| `packages/agent-runtime/src/skills/` | 新增 + 重构 | 加 4 个 skill，code-generation 改名为 frontend-coding |
| `packages/agent-runtime/src/` | 扩展 | agent-runner.ts 增加 skill 路由 |
| `plugins/` | 新增 | 加 4 个插件目录 |
| `packages/validation-core/` | 扩展 | 加 API/DB/集成验证类型定义 |
| `packages/persistence/` | 扩展 | 加 ProjectMetrics 存储 |
| `apps/studio-api/src/server.ts` | 扩展 | 加 4 条 metrics 路由 |
| `apps/studio-web/src/components/` | 新增 | DataView 面板（4 个子组件） |

---

## 10. 风险与注意事项

1. **后端多语言复杂度** — 三种语言（TS/Python/Go）的生成模板差异大，先聚焦一种语言（NestJS）做好，再扩展
2. **Agent 输出质量** — 数据库推荐、API 设计的准确性依赖 LLM 能力，需要在 prompt 里加强约束和校验回流
3. **生成产物一致性** — 前后端通过 ApiContract 约束接口，确保前端调用的 endpoint 与后端生成的一致
4. **现有前端能力不丢弃** — 前端相关的 skills/plugins 全部保留，只是重新组织
