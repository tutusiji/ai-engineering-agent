# playwright-runner

负责基于 target profile 与目标仓库现状，执行 Playwright 冒烟验证并输出统一验证结果。

## 当前能力

### 诊断模式（`buildPlaywrightValidation`）

- 根据 target profile 判断是否支持 Playwright
- 扫描目标仓库中的 Playwright 配置、依赖与测试目录
- 输出 `runnerStatus`：`unsupported`、`not-configured`、`incomplete`、`ready`
- 不阻断主 workflow

### 真实执行模式（`executePlaywrightValidation`）

- 仓库具备执行条件（`ready`）时，真实运行 `npx playwright test --reporter=json`
- 解析 JSON 报告：统计 `total/passed/failed/skipped`，提取失败用例详情
- 输出 `playwright-exec.log` 日志产物到 `artifacts/playwright/`
- 执行超时（默认 120s）或异常时自动降级为诊断报告
- 可选 `testCommand` / `timeoutMs` / `outputDir` 覆盖默认行为

## 接入方式

```ts
import { executePlaywrightValidation } from '@ai-engineering-agent/playwright-runner';

const result = await executePlaywrightValidation({
  targetProfileId: 'react-admin',
  targetProject: '/path/to/project',
  outputDir: '/path/to/project/artifacts/playwright',
});
```
