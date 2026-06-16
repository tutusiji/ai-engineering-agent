# AI Engineering Agent

一个面向多前端目标的多 Agent 工程平台。

## 支持的目标方向

- Vue3 管理后台
- React 管理后台
- PC 单页应用
- H5 单页应用
- 微信小程序

## 目标

- 将聊天描述、PRD、设计说明、实现文档转成结构化需求
- 先生成受约束的实现方案，而不是直接自由生成代码
- 复用内部项目模式、通用组件和目标端约定
- 强制落实 loading、debounce、危险操作二次确认、表单提交锁等交互规则
- 通过规则检查、端到端测试和视觉回归验证生成结果

## 推荐的 MVP 范围

1. 需求结构化
2. 目标 profile 选择与页面规划
3. 面向单一 profile 的实现方案生成
4. loading、debounce、删除确认、通用页面模式的规则检查
5. 在目标端支持的前提下执行 Playwright 冒烟和视觉回归

## 技术栈

- Studio：React + TypeScript + React Flow + Monaco
- API：NestJS + TypeScript
- Workers：Node.js + TypeScript
- Queue：Redis + BullMQ
- DB：PostgreSQL
- Validation：ESLint + TypeScript + Vitest + Playwright + Pixelmatch

## 平台策略

平台层刻意保持框架中立：

- `workflows/` 负责流程编排
- `contracts/` 负责结构化中间产物
- `policies/` 负责通用规则与目标 profile
- `plugins/` 负责确定性执行能力
- `skills/` 负责受约束的推理和生成

第一期生产落地完全可以先从 `vue3-admin` profile 开始，但平台本身不应被命名或设计成只服务这一个方向。

## 为什么不先依赖 Dify 或 n8n

它们都是可选项，不是必选项。

- Dify 更适合轻量 prompt 应用和知识工作流
- n8n 更适合通知、Webhook 和外部系统集成
- 这个项目真正需要的是具备强契约、重试、校验闸门、目标 profile 与修复回流能力的工作流引擎

## 访问入口

规划中的统一外网入口：`https://joox.cc:4399`

- 通过公网访问
- 复用 `joox.cc` SSL 证书
- 入口部署方案见 `docs/deployment-public-entry.md`
- Nginx 配置草案见 `deploy/nginx/joox-4399.conf`

## 项目结构

完整设计见 `docs/architecture.md`，第一版可运行骨架见 `workflows/`、`policies/`、`contracts/` 与 `packages/`。
