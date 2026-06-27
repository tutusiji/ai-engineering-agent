# 项目优化问题列表

> 由当前代码审查生成的持续优化 backlog，按优先级排序。

## 优先级说明

- **P0**：严重影响可维护性、安全性或生产可用性，应优先处理。
- **P1**：明显改进空间，影响体验、性能或长期健康。
- **P2**：体验与代码质量细节，可后续逐步处理。

---

## P0 — 必须尽快修复

### 1. 后端 `server.ts` 过于庞大，职责严重耦合

- **问题描述**：`apps/studio-api/src/server.ts` 超过 1800 行，路由定义、LLM 调用、工作流执行、业务逻辑全部耦合在一个文件中，违反单一职责原则。
- **影响**：代码难以维护、测试、协作和审查。
- **建议方案**：
  - 拆分为 `routes/`、`services/`、`repositories/` 分层架构
  - 按领域拆分：sessions、chat、runs、workflows、artifacts、metrics
- **涉及文件**：
  - `apps/studio-api/src/server.ts`
  - 新增：`apps/studio-api/src/routes/*`、`apps/studio-api/src/services/*`

### 2. 测试覆盖率极低，核心路径无保护

- **问题描述**：项目仅有少量 smoke 测试和类型测试，核心 LLM 调用流、SSE 流、会话管理、数据库操作、工作流执行均无测试。
- **影响**：重构风险高，无法通过 CI 拦截回归 bug。
- **建议方案**：
  - 为核心 hooks（`useChat`、`useSessions`、`useDocument`）添加单元测试
  - 为 API 路由添加集成测试（supertest + 测试数据库）
  - 为 LLM 调用层添加 mock 测试
  - 引入覆盖率阈值要求（如 60%）
- **涉及文件**：
  - `apps/studio-web/src/hooks/__tests__/*`
  - `apps/studio-api/src/__tests__/*`
  - `packages/persistence/src/__tests__/*`

### 3. 生产启动脚本 `all` 模式不可靠

- **问题描述**：`scripts/start-prod.sh` 的 `all` 模式使用 `exec pnpm ... &` 后台启动两个进程。`exec` 会替换当前 shell，后台模式下 `wait` 无法正确等待子进程，且任一服务崩溃时无法被妥善监控。整体脚本不适合作为生产入口。
- **影响**：生产环境 `studio:prod` 脚本不可靠；实际生产应使用 PM2 的 `ecosystem.config.cjs`。
- **建议方案**：
  - 重写 `start-prod.sh`，使用 `concurrently` 或直接使用 PM2 启动
  - 增加健康检查和失败处理
  - 在 CI 中对脚本进行 smoke 测试
- **涉及文件**：
  - `scripts/start-prod.sh`
  - `ecosystem.config.cjs`

### 4. GitHub Actions 部署脚本存在安全隐患

- **问题描述**：
  - 部署步骤直接执行 `git checkout -- .` 和 `git clean -fd`，会无条件丢弃服务器本地修改
  - 缺少 health check、回滚机制、失败状态保留
  - `pm2 reload/restart/start` 链式 fallback 没有处理端口占用或服务起不来的情况
- **影响**：服务器调试配置丢失、部署失败难定位、无回滚能力。
- **建议方案**：
  - 增加 health check 和 smoke test
  - 使用更安全的 `pm2 startOrReload` 方式
  - 保留部署失败时的状态并提供回滚脚本
- **涉及文件**：
  - `.github/workflows/deploy.yml`
  - 新增：`scripts/health-check.sh`、`scripts/rollback.sh`

### 5. CORS 配置过于开放

- **问题描述**：`apps/studio-api/src/server.ts` 中使用 `app.use(cors())`，未限制 origin。
- **影响**：任意网站可调用 API，存在 CSRF/滥用风险。
- **建议方案**：配置 origin 白名单；生产仅允许 `https://joox.cc:4399`，开发允许 `localhost:4400`。
- **涉及文件**：
  - `apps/studio-api/src/server.ts`

### 6. 缺少基础安全中间件

- **问题描述**：后端无 rate limiting、helmet、compression 等中间件，`express.json({ limit: '10mb' })` 的 body 上限可能被滥用。
- **影响**：易被 DDoS、滥用 LLM API 密钥、缺少安全响应头。
- **建议方案**：
  - 添加 `express-rate-limit`、`helmet`、`compression`
  - 在 Nginx 层配置 rate limit
  - 对敏感端点考虑 API key 或基础认证
- **涉及文件**：
  - `apps/studio-api/src/server.ts`
  - `deploy/nginx/joox-4399.conf`

### 7. 前端 `App.tsx` 状态管理过于集中

- **问题描述**：`App.tsx` 管理近 20 个 state 变量和大量业务逻辑，组件渲染负担重，子组件 props 过多。
- **影响**：不必要的重渲染、可维护性差、新增功能困难。
- **建议方案**：
  - 使用 Context + Reducer 或轻量状态管理
  - 将架构、设计、代码生成等状态拆分为独立 hooks 或 context
- **涉及文件**：
  - `apps/studio-web/src/App.tsx`
  - 新增：`apps/studio-web/src/contexts/`、`apps/studio-web/src/hooks/useArchitecture.ts` 等

---

## P1 — 建议中期改进

### 8. 前端 bundle 体积过大

- **问题描述**：构建产物 JS 593KB（gzip 184KB），CSS 405KB，Vite 已提示 chunk 超过 500KB。
- **影响**：首次加载慢，弱网体验差。
- **建议方案**：
  - 对 `react-markdown` 等重型库使用动态导入
  - 配置 Vite `manualChunks`
  - 审查 HeroUI 是否按组件导入
  - 对 CSS 进行 purge/优化
- **涉及文件**：
  - `apps/studio-web/vite.config.ts`
  - `apps/studio-web/src/components/ChatPanel.tsx`
  - `apps/studio-web/src/components/ArchitecturePanel.tsx`

### 9. 数据库连接池管理不足

- **问题描述**：全局单例 pool 缺少优雅关闭、重试机制、健康检查查询。
- **影响**：部署重启时可能出现连接泄漏，数据库短暂不可用时服务直接崩溃。
- **建议方案**：
  - 添加 `process.on('SIGTERM', closePool)`
  - 在健康检查端点中增加 DB 探针
- **涉及文件**：
  - `packages/persistence/src/store.ts`
  - `apps/studio-api/src/server.ts`

### 10. 缺少输入验证和请求体校验

- **问题描述**：API 端点直接读取 `req.body`、`req.params`、`req.query`，未使用 Zod/Joi/express-validator 校验。
- **影响**：可能导致 500 错误、数据结构不可控、路径遍历等安全问题。
- **建议方案**：
  - 引入 Zod 对所有 API 输入进行 schema 校验
  - 对 `filePath` 进行白名单校验
  - 统一错误响应格式
- **涉及文件**：
  - `apps/studio-api/src/server.ts`
  - 所有路由文件

### 11. 路径遍历风险

- **问题描述**：`/api/runs/:id/artifacts/*path` 使用 `req.params.path` 拼接文件路径，未校验 `../` 或绝对路径。
- **影响**：可能被利用读取服务器任意文件。
- **建议方案**：
  - 校验 filePath 只能包含合法字符
  - `path.normalize` 后检查是否在 baseDir 下
  - 禁止 `..` 或绝对路径
- **涉及文件**：
  - `apps/studio-api/src/server.ts`
  - `packages/persistence/src/store.ts`

### 12. 前端 iframe 渲染 AI 生成 HTML 的 XSS 风险

- **问题描述**：`DesignPanel` 使用 `iframe srcDoc={html}` 展示 AI 生成 HTML，同源下内部脚本可能访问 `window.parent`。
- **影响**：存在 XSS 和数据泄露风险。
- **建议方案**：
  - 为 iframe 添加更严格的 `sandbox` 属性
  - 使用 CSP 限制 iframe 内资源加载
  - 对 AI 生成 HTML 进行 sanitization
- **涉及文件**：
  - `apps/studio-web/src/components/DesignPanel.tsx`

### 13. 缺少 ESLint / Prettier / Biome 配置

- **问题描述**：项目中没有 ESLint、Prettier、Biome 等代码规范工具配置。
- **影响**：与 CLAUDE.md 中“提交前确保通过 lint 检查”的要求不符，代码风格不统一。
- **建议方案**：
  - 添加 ESLint + Prettier 或 Biome
  - 在 CI 中运行 lint
  - 添加 pre-commit hook
- **涉及文件**：
  - 新增：`eslint.config.js`、`.prettierrc` 或 `biome.json`
  - `.github/workflows/deploy.yml`

### 14. TypeScript 版本不一致

- **问题描述**：根目录 `tsconfig.base.json` 指定 `typescript: ^6.0.3`，但 `apps/studio-web` 使用 `typescript: ~5.8.3`。
- **影响**：跨包类型行为可能不一致。
- **建议方案**：统一 TypeScript 版本和 `moduleResolution` 策略。
- **涉及文件**：
  - `tsconfig.base.json`
  - `apps/studio-web/package.json`
  - `apps/studio-api/package.json`

### 15. 依赖版本落后

- **问题描述**：React、HeroUI、Vite、lucide-react、TypeScript 等依赖有较新版本。
- **影响**：错过 bug fix 和性能优化，部分依赖可能存在安全漏洞。
- **建议方案**：
  - 制定定期依赖更新策略
  - 升级前运行完整测试
  - 考虑 dependabot/renovate
- **涉及文件**：
  - 多个 `package.json`

---

## P2 — 细节优化

### 16. `useChat` SSE 解析逻辑重复

- **问题描述**：`useChat.ts` 中有两套 SSE 解析逻辑，与后端 SSE 格式强耦合。
- **建议方案**：提取 SSE 解析为独立工具函数，统一前后端 SSE 协议。
- **涉及文件**：
  - `apps/studio-web/src/hooks/useChat.ts`

### 17. 前端组件内联样式和 Tailwind 类过长

- **问题描述**：多个组件使用大量内联 Tailwind class 字符串，`index.css` 中使用大量 `!important` hack。
- **建议方案**：
  - 使用 `clsx`/`tailwind-merge`
  - 暗色模式改用 Tailwind `dark:` 变体 + HeroUI 主题
  - 提取可复用样式组件
- **涉及文件**：
  - `apps/studio-web/src/index.css`
  - `apps/studio-web/src/components/*.tsx`

### 18. `studio` 脚本后台启动不可靠

- **问题描述**：`package.json` 中 `"studio": "pnpm studio:api & pnpm studio:web"` 在部分 shell 中不可靠。
- **建议方案**：使用 `concurrently` 或 `pm2` 启动多服务。
- **涉及文件**：
  - `package.json`

### 19. 环境变量管理不透明

- **问题描述**：项目缺少 `.env.example`，新开发者不知道需要配置哪些变量。
- **建议方案**：
  - 添加 `.env.example`
  - 在 README 中说明环境变量
  - 启动时用 `envalid` 或 `zod` 校验必要环境变量
- **涉及文件**：
  - 新增：`.env.example`
  - `README.md`

### 20. 文档与代码不一致

- **问题描述**：`docs/architecture.md` 中建议 Studio Web 使用 React Flow / Monaco / Ant Design，实际使用 HeroUI + Tailwind。
- **建议方案**：更新 `docs/architecture.md`，保持架构决策记录（ADR）与实现一致。
- **涉及文件**：
  - `docs/architecture.md`
  - `README.md`

---

## 修复计划建议

| 阶段 | 目标 | 预计时间 |
|------|------|---------|
| 第 1 阶段 | 修复 P0 中的 1-2 个最紧急项：生产脚本 bug、CORS、安全中间件、输入校验 | 1-2 天 |
| 第 2 阶段 | 后端分层重构（拆分 server.ts）、补充核心测试 | 3-5 天 |
| 第 3 阶段 | 前端状态拆分、bundle 优化、TS 版本统一 | 2-3 天 |
| 第 4 阶段 | 文档更新、P2 细节优化、依赖升级 | 持续进行 |
