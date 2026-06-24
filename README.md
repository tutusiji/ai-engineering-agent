# AI Engineering Agent

一个**架构驱动**的全栈代码生成平台。输入自然语言需求，通过 13 个专业 AI Agent Skill 协作，输出完整的全栈项目代码——涵盖前端、后端、数据库、部署配置。

> 🔗 访问入口: `https://joox.cc:4399`

## 核心设计理念

### 架构驱动 → 非模板驱动

系统不依赖硬编码的技术模板。每个项目根据实际需求**动态生成全栈架构方案**，独立做出所有技术选型：

| 层级 | 可选方案 |
|------|----------|
| **前端框架** | React, Vue3, Svelte, Solid, Angular |
| **UI 组件库** | Ant Design, Element Plus, shadcn/ui, Material UI, Naive UI |
| **后端框架** | NestJS, Express, FastAPI, Gin, Spring Boot, Actix-Web |
| **后端语言** | TypeScript, Python, Go, Java, Rust |
| **ORM** | Prisma, TypeORM, SQLAlchemy, GORM, Drizzle |
| **数据库** | PostgreSQL, MySQL, MongoDB, SQLite, CockroachDB |
| **缓存** | Redis, Memcached |
| **部署** | Docker Compose, Kubernetes, Serverless (Vercel/Netlify), 静态托管 |

架构生成流程：`需求对话 → 架构方案生成 → 对话精炼 → 保存 → 方案驱动代码生成`

每次架构生成后，可通过**对话式交互**迭代调整（如"将数据库改为 MongoDB，添加 Redis 缓存层"），满意后显式保存到数据库。

### 受约束的代码生成

- 先生成结构化**中间产物**（架构方案、数据模型、API 契约、页面规划），再生成代码
- 代码生成强约束**交互规则**：loading/empty/error 状态、debounce 300ms、危险操作二次确认、表单提交防重复
- 生成结果通过规则检查、端到端测试、视觉回归验证

### Profile 可选

可选的 target profile 作为技术偏好提示（非强制约束），架构方案可覆盖 profile 中的任何决策。

## 架构精华

### 三级降级模式

所有 skill 采用统一的数据读取策略：

```
architectureDesign (架构方案输出) → resolvedTargetProfile (profile偏好) → 硬编码默认值
```

架构方案是真正的技术决策来源，profile 退化为可选提示，默认值仅在最底层兜底。

### Skill 协作流水线

```
用户需求 → interactive-requirement (需求对话)
         → requirement-analysis (需求结构化)
         → target-profile-selection (技术栈推荐)
         → architecture-planning (架构方案生成) ← ── 对话精炼反馈
         → page-planning (页面规划)
         → data-modeling (数据建模)
         → api-design (API 契约设计)
         → ui-library-selection (UI 库映射)
         → frontend-coding (前端代码生成)
         → backend-coding (后端代码生成)
         → deployment-planning (部署配置)
         → code-generation (最终代码输出)
         → design-generation (交互预览)
```

### 架构互动流程

```
需求对话 ──→ 生成架构方案（草稿）
              ├── 不满意？对话精炼 ──→ 更新草稿
              ├── 满意？保存到数据库（版本历史）
              └── 切换历史版本查看
```

## 目录架构

```
ai-engineering-agent/
├── apps/
│   ├── studio-api/          # Studio API 服务 (Express + tsx)
│   └── studio-web/          # Studio Web 前端 (React + Vite + HeroUI)
│
├── packages/                # 核心逻辑包
│   ├── agent-runtime/       # Agent 运行时 + 13 个 AI Skill 定义
│   │   └── src/skills/      #   ├── architecture-planning.ts  架构方案生成
│   │                        #   ├── requirement-analysis.ts   需求结构化
│   │                        #   ├── data-modeling.ts          数据建模
│   │                        #   ├── api-design.ts             API 契约设计
│   │                        #   ├── frontend-coding.ts        前端代码生成
│   │                        #   ├── backend-coding.ts         后端代码生成
│   │                        #   ├── deployment-planning.ts    部署方案
│   │                        #   ├── design-generation.ts      交互预览
│   │                        #   ├── code-generation.ts        最终代码输出
│   │                        #   └── ...                       更多 skill
│   ├── skill-sdk/           # Skill SDK — SkillContext / SkillDefinition 类型
│   ├── workflow-core/       # 工作流引擎 — DAG 编排 + 重试 + 校验闸门
│   ├── persistence/         # 持久化层 — PostgreSQL session/document/messages
│   ├── shared-types/        # 共享类型定义 (TargetProfileRef, JsonObject 等)
│   ├── policy-engine/       # 策略引擎 — target profile 解析与过滤
│   ├── contract-schema/     # 合约加载 + 校验
│   ├── validation-core/     # 验证核心
│   └── plugin-sdk/          # 插件 SDK — 确定性执行能力接口
│
├── plugins/                 # 确定性执行插件
│   ├── api-contract-validator/  # API 合约校验
│   ├── api-scaffold/            # API 脚手架生成
│   ├── db-migration/            # 数据库迁移
│   ├── docker-generator/        # Docker 配置生成
│   ├── navigation-decider/      # 路由模式判断
│   ├── page-generator/          # 页面生成器
│   ├── playwright-runner/       # E2E 测试执行
│   ├── project-scanner/         # 项目扫描
│   ├── rule-checkers/           # 交互规则检查 (loading/debounce/确认)
│   └── visual-regression-runner/ # 视觉回归
│
├── workflows/               # 工作流定义 (YAML DAG)
│   ├── from-idea-to-fullstack.yaml   # 完整全栈生成流程
│   └── from-idea-to-app.yaml         # 简化流程
│
├── contracts/               # 结构化中间产物 Schema (JSON Schema)
│   ├── architecture-design.schema.json
│   ├── requirement-spec.schema.json
│   ├── data-model.schema.json
│   ├── api-contract.schema.json
│   ├── page-plan.schema.json
│   └── ...
│
├── policies/                # 策略配置
│   ├── shared-frontend-policy.yaml   # 共享前端规则
│   └── targets/                      # Target profile 定义 (legacy)
│
├── deploy/                  # 部署配置
│   └── nginx/               # Nginx 配置
│
├── scripts/                 # 工具脚本
├── docs/                    # 设计文档
└── ecosystem.config.cjs     # PM2 进程管理
```

## 技术栈（平台本身）

| 组件 | 技术 |
|------|------|
| Studio Web | React 18 + TypeScript + Vite + HeroUI + Tailwind CSS |
| Studio API | Express + TypeScript + tsx |
| LLM 推理 | DeepSeek V4 Pro (兼容 OpenAI SDK) |
| 持久化 | PostgreSQL (JSONB 文档存储) |
| 进程管理 | PM2 |
| 反向代理 | Nginx + SSL (joox.cc) |
| 部署 | GitHub Actions → rsync + SSH → 火山服务器 |
| 包管理 | pnpm workspace (22 packages) |

## 项目特色

1. **不是 Copilot 包装器** — 系统做结构化决策（架构选型、模块划分、数据建模），而非行级代码补全
2. **架构方案可对话调整** — 生成架构后可输入反馈精炼，满意后保存，所有版本可追溯
3. **全栈一致** — 从需求到前端、后端、数据库、部署配置，一套流程贯通
4. **交互规则强制** — loading/empty/error 状态、debounce、确认弹窗、防重复提交自动注入生成的代码
5. **框架中立** — 平台层不绑定任何具体框架，架构方案动态决定技术栈
6. **显式保存** — 架构方案不会自动入库，需要用户确认后保存，支持草稿-保存工作流

## 本地开发

```bash
pnpm install                    # 安装依赖
pnpm --filter @ai-engineering-agent/studio-web dev   # 启动前端 (:4400)
pnpm tsx apps/studio-api/src/server.ts              # 启动 API (:4401)
```

## 访问入口

- 统一外网入口: `https://joox.cc:4399`
- SSL: 复用 `joox.cc` 证书
- 部署: GitHub Actions 自动构建并 rsync 到火山服务器，PM2 管理进程
