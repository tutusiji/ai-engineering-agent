# 下一步计划

## Phase 1：先把核心跑起来

- [x] 实现工作流定义加载与校验
- [x] 实现 `contracts/` 下 schema 注册表
- [x] 实现 `policies/` 下策略注册表
- [x] 实现 `policies/targets/` 下 target profile 注册表
- [x] 增加一个最小本地 runner，至少能执行一条 workflow

## Phase 2：接真实项目适配器

- [x] 实现最小可用 `project-scanner`，可扫描框架线索、目录结构与规则检查证据
- [x] 实现最小可用导航决策插件，基于 page plan + profile 能力输出 `UIContract`
- [x] 实现最小可用 `page-generator`，基于 `ImplementationPlan` 和 `UIContract` 输出 `GenerationReport`
- [x] 补齐 `validation-core` 包，统一验证结果模型与 mock 校验链路
- [x] 让本地 `workflow:mock` 能输出规则检查、E2E、视觉回归的聚合报告
- [x] 先把 loading、debounce、删除确认 3 类规则检查器从 mock 适配到真实仓库扫描结果
- [x] 接入诊断型 `playwright-runner`，可识别支持性、配置完整度与测试线索
- [x] 接入诊断型 `visual-regression-runner`，可识别视觉基线、截图目录与视觉测试线索
- [x] 接入 Agent Runtime (LLM 客户端 + Agent Runner + 4 个 Skill 定义)
- [x] 创建 `llm-runner.ts` 真实 LLM 驱动执行入口
- [x] 实现 interactive-requirement Skill (多轮对话式需求收集)
- [x] 实现 design-generation Skill (HTML 设计稿生成)
- [x] 实现 code-generation Skill (从需求文档生成代码)
- [x] 把诊断型 `playwright-runner` / `visual-regression-runner` 升级为真实执行器，并产出日志、截图、diff 图与 HTML artifacts

## Phase 3：补可视化和审查能力

- 增加 artifacts 持久化和运行历史
- 增加人工审批闸门
- 先做第一批 Studio 页面：工作流列表、运行详情、产物查看、profile 选择器

## Phase 4：补回流和多 profile 能力

- 增加修复回流 loop
- 增加视觉回归基线
- 增加内部组件目录抽取
- 从第一个生产 profile 扩展到 React、H5 或小程序
