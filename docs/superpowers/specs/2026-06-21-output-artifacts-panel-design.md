# 输出产物面板设计文档

## 背景与目标

在 AI Engineering Agent Studio 的右侧边栏顶部新增一个固定的“输出产物”面板，用于提炼、汇总并展示当前 Session 下的所有可下载产物：

- 对话提炼出的结构性需求文档 `.md`
- 架构设计 `.md`
- UI 预览渲染产物（可下载 `.html` 或打包 `.zip`）
- 最终生成的代码包 `.zip`
- 各类中间产物（实现计划、测试计划、验证报告等）

面板需提供产物列表、文件大小、单文件下载与批量打包下载能力。产物较多时，列表区域内部可滚动，面板整体保持固定高度。

## 范围

- **前端：** `apps/studio-web`
- **后端：** `apps/studio-api`
- **数据存储：** 复用现有 `ArtifactStore`，并在 Session 中记录产物运行 ID

本次不涉及 workflow 系统重构，设计/代码生成端点保持独立，仅增加产物关联逻辑。

## 设计原则

1. **混合方案：** 简单文本产物（`.md`、`.html`）由前端根据当前状态即时生成；`.zip` 打包由后端完成。
2. **Session 级产物：** 所有产物围绕当前 `sessionId` 组织，切换 Session 时列表自动刷新。
3. **向后兼容：** 旧 Session 没有产物记录时，仍展示前端可派生的基础产物。
4. **可扩展：** 中间产物类型通过 `category` 字段扩展，不改动现有 UI 布局。

## 布局方案

在 `App.tsx` 右侧边栏（`DocumentPanel`）上方新增固定高度的 `ArtifactsPanel`：

```
┌──────────────────────────────────────┐
│ Header                               │
├──────────┬───────────────┬───────────┤
│          │               │  产物面板  │
│ Sidebar  │  Main Content │  (固定)   │
│          │               │───────────│
│          │               │ Document  │
│          │               │ (可滚动)  │
└──────────┴───────────────┴───────────┘
```

- 产物面板默认高度固定，列表超出时内部滚动。
- 下方 `DocumentPanel` 保持原有滚动行为，不受产物面板影响。

## 数据模型

### ArtifactItem

```ts
type ArtifactCategory =
  | 'requirement'
  | 'architecture'
  | 'design'
  | 'code'
  | 'intermediate';

type ArtifactSource = 'session-state' | 'artifact-run';

interface ArtifactItem {
  id: string;           // 唯一标识，如 req-md、design-zip、code-v1
  category: ArtifactCategory;
  label: string;        // 展示名称
  size?: number;        // 字节数
  updatedAt: number;    // 更新时间
  source: ArtifactSource;
  downloadUrl?: string; // 后端下载地址（artifact-run 类型）
  content?: string;     // 前端可直接生成的文本内容（session-state 类型）
}
```

### Session 产物记录

在 Session document 中新增 `_artifactRuns` 数组：

```ts
interface SessionArtifactRun {
  runId: string;
  type: 'design' | 'code' | 'workflow';
  createdAt: number;
  label?: string;
}
```

实际文件内容仍由 `ArtifactStore` 管理，Session 只记录关联关系。

### 产物来源映射

| 产物 | category | source | 生成方式 |
|------|----------|--------|----------|
| 需求文档 `.md` | `requirement` | `session-state` | 前端从 `document` 对象生成 |
| 架构设计 `.md` | `architecture` | `session-state` | 首期复用 `document` 内容，后续可扩展独立字段 |
| UI 预览 `.html` | `design` | `session-state` | 前端从 `designHtml` 生成 |
| UI 预览 `.zip` | `design` | `artifact-run` | 后端把 design 产物打包 |
| 代码包 `.zip` | `code` | `artifact-run` | 后端把 code 产物打包 |
| 中间产物 | `intermediate` | `artifact-run` | workflow 各节点输出 |

## 组件设计

### 新增组件

#### `ArtifactsPanel`

位置：`apps/studio-web/src/components/ArtifactsPanel.tsx`

Props：

```ts
interface ArtifactsPanelProps {
  artifacts: ArtifactItem[];
  loading: boolean;
  onDownloadOne: (id: string) => void;
  onDownloadAll: () => void;
}
```

职责：

- 按 category 分组渲染产物列表。
- 每项显示图标、名称、大小、单独下载按钮。
- 顶部显示标题与“打包下载全部”按钮。
- 空状态与加载状态处理。

#### `useArtifacts` Hook

位置：`apps/studio-web/src/hooks/useArtifacts.ts`

输入：

```ts
interface UseArtifactsInput {
  sessionId: string | null;
  document: RequirementDocument | null;
  designHtml: string | null;
  generatedFiles: Array<{ path: string; kind: string; content?: string }>;
}
```

输出：

```ts
interface UseArtifactsOutput {
  artifacts: ArtifactItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  downloadOne: (id: string) => void;
  downloadAll: () => void;
}
```

职责：

- 根据当前状态生成 `session-state` 产物。
- 调用后端接口拉取 `artifact-run` 产物并合并。
- 提供下载函数，单文件优先使用 `downloadUrl`，批量打包走后端 zip 接口。

### App.tsx 改动

在右侧 `<aside>` 内，`DocumentPanel` 上方插入：

```tsx
<aside className="w-[360px] shrink-0 bg-white border-l border-divider h-full flex flex-col">
  <ArtifactsPanel
    artifacts={artifacts}
    loading={artifactsLoading}
    onDownloadOne={downloadOne}
    onDownloadAll={downloadAll}
  />
  <div className="flex-1 overflow-auto min-h-0">
    <DocumentPanel ... />
  </div>
</aside>
```

## 后端接口

### 新增接口

#### `GET /api/sessions/:id/artifacts`

返回当前 Session 关联的所有产物元数据：

```json
{
  "artifacts": [
    {
      "id": "req-md",
      "category": "requirement",
      "label": "需求文档.md",
      "size": 2048,
      "updatedAt": 1750497600000,
      "source": "session-state",
      "downloadUrl": "/api/sessions/:id/artifacts/download?id=req-md"
    },
    {
      "id": "design-zip",
      "category": "design",
      "label": "UI预览.zip",
      "size": 15360,
      "updatedAt": 1750497700000,
      "source": "artifact-run",
      "downloadUrl": "/api/sessions/:id/artifacts/download?id=design-zip"
    }
  ]
}
```

#### `GET /api/sessions/:id/artifacts/download`

- Query：`?id=<单个id>` 或 `?ids=a,b,c`
- 单文件：直接返回对应内容，设置正确 `Content-Type`。
- 多文件：返回 `application/zip`，文件名 `session-<id>-artifacts.zip`。
- 对于 `session-state` 类型的产物，后端需临时从 Session 中读取内容写入响应或 zip。

### 现有端点改动

#### `POST /api/generate/design`

生成成功后，把产物关联到当前 Session：

```ts
await sessionStore.addArtifactRun(sessionId, {
  runId: artifactRunId,
  type: 'design',
  createdAt: Date.now(),
});
```

#### `POST /api/generate/code`

生成成功后，同样把产物关联到当前 Session：

```ts
await sessionStore.addArtifactRun(sessionId, {
  runId: artifactRunId,
  type: 'code',
  createdAt: Date.now(),
});
```

### Zip 打包实现

- 后端使用 `jszip` 进行打包。
- `design` / `code` 类型：从 `ArtifactStore` 读取该 `runId` 下所有文件，写入 zip。
- `session-state` 类型：把文本内容作为文件写入 zip。
- 产物元数据中的 `size` 在保存时预计算，避免实时读取。

## 数据流

```
用户点击生成设计/代码
        ↓
后端生成文件 → ArtifactStore.save(runId, path, content)
        ↓
后端把 runId 写入 session._artifactRuns
        ↓
前端 useArtifacts 合并 session-state + 拉取 /api/sessions/:id/artifacts
        ↓
ArtifactsPanel 渲染产物列表
        ↓
用户点击下载 → 单文件走 downloadUrl；批量走 /api/sessions/:id/artifacts/download?ids=...
```

## 错误处理与边界情况

| 场景 | 处理方式 |
|------|----------|
| 无产物 | 显示占位文案“暂无输出产物，开始生成后会自动汇总” |
| 加载中 | 列表区域显示小型 spinner，不阻塞文档面板 |
| 单文件下载失败 | 按钮旁短暂显示错误 tooltip |
| 批量下载失败 | 面板顶部显示错误提示条 |
| 未选择 Session | 产物面板禁用或显示占位 |
| 产物过多 | 列表区域内部滚动，面板高度固定 |
| 旧 Session 无 `_artifactRuns` | 仅展示前端可派生的需求文档与 UI 预览 `.html` |

## 测试计划

### 单元测试

- `useArtifacts`：
  - 正确从 `document` 生成 `requirement` 产物。
  - 正确合并后端返回的 `artifact-run` 产物。
  - 切换 `sessionId` 时重新加载。
- `ArtifactsPanel`：
  - 空状态渲染正确。
  - 点击单文件下载按钮触发 `onDownloadOne`。
  - 点击“打包下载全部”触发 `onDownloadAll`。

### 接口测试

- `GET /api/sessions/:id/artifacts`：
  - 返回格式符合 `ArtifactItem[]`。
  - 无产物时返回空数组。
- `GET /api/sessions/:id/artifacts/download`：
  - 单文件下载返回正确 `Content-Type`。
  - 多文件下载返回合法 zip。
  - 不存在的产物返回 404。

### 端到端验证

- 完成一次对话后，产物面板出现“需求文档.md”并可下载。
- 生成 UI 预览后，出现“UI预览.zip”，可单独下载，也可批量打包下载。
- 生成代码后，出现“代码包.zip”。
- 切换 Session，产物列表自动刷新为新 Session 的产物。

## 实现顺序

1. 定义 `ArtifactItem` 类型与 Session `_artifactRuns` 结构。
2. 后端：新增 `/api/sessions/:id/artifacts` 与 `/download` 接口。
3. 后端：在 `/generate/design` 和 `/generate/code` 中保存产物关联。
4. 前端：实现 `useArtifacts` hook。
5. 前端：实现 `ArtifactsPanel` 组件。
6. 前端：在 `App.tsx` 中集成并调整右侧边栏布局。
7. 补充测试与验收。

## 未解决问题

- 架构设计 `.md` 是否需要独立生成端点，还是首期与需求文档合并展示，待实现阶段确认。
- 产物列表排序规则（按时间倒序还是按 category 固定顺序），默认按 category 固定顺序 + 同 category 按时间倒序。
