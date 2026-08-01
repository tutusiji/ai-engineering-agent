# visual-regression-runner

负责基于 target profile、生成产物线索和目标仓库现状，执行视觉回归验证并输出统一验证结果。

## 当前能力

### 诊断模式（`buildVisualRegressionValidation`）

- 根据 target profile 判断视觉回归是否支持
- 扫描视觉基线目录、截图产物目录和测试线索
- 输出 `runnerStatus`：`unsupported`、`limited`、`not-configured`、`incomplete`、`ready`

### 真实执行模式（`executeVisualRegression`）

- 使用 `playwright-core` + 系统 Chrome（`/usr/bin/google-chrome` 等自动探测）无头截图
- `pixelmatch` + `pngjs` 像素对比，输出 diff 图（`.diff.png`）与差异百分比
- 自动管理基线：
  - 无基线目录 → 首次运行生成基线（`baseline-created`）
  - 有基线 → 逐页对比，差异率 ≥ 5% 判定失败（`failed`）
- 产物目录：基线 `artifacts/visual-baseline/`，截图与 diff `artifacts/screenshots/`
- 浏览器不可用或未提供页面时自动降级为诊断报告

## 接入方式

```ts
import { executeVisualRegression } from '@ai-engineering-agent/visual-regression-runner';

const result = await executeVisualRegression({
  targetProfileId: 'react-admin',
  targetProject: '/path/to/project',
  pages: [{ name: 'home', url: 'http://localhost:3000' }],
});
```
