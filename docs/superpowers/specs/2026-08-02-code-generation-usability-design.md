# 代码生成功能「修复现状 + 可用性」设计

> 日期:2026-08-02
> 范围:AI Engineering Agent 的代码生成链路(SSE 流式生成 / 代码精炼 / CodePanel UI)
> 目标:修复进行中改动的缺陷,提升可用性(进度式生成体验、阶段选择、取消机制)

## 背景与现状

代码生成功能当前处于「半成品」状态,有一批未提交的改动:

- 后端 `/api/generate` 已有 `/code`(非流式)、`/code/stream`(SSE 流式)、`/code/refine`(SSE 流式精炼)三个端点。
- 前端 `useGeneration` 已封装流式生成/精炼,`CodePanel` 支持文件树 + 语法高亮 + 单文件/ZIP 下载 + 对话修改。

发现的问题:

1. **编译错误**:`CodePanel.tsx` 引用了 `refineOpen`/`refineFeedback` 状态但从未声明(`CodePanel.tsx:193,222`),TypeScript 编译失败。
2. **阶段写死**:前端 `generateCode` 不传 `phaseId`,后端默认 `'P1'`,多阶段需求只能生成第一阶段。
3. **无法取消**:流式生成最长 65536 token,无 AbortController / 取消按钮,用户无法中断,后端会继续烧 token。
4. **流式体验粗糙**:生成过程中直接显示 LLM 输出的原始 JSON 文本流,不直观。
5. **事件处理不全**:前端忽略 `warning`(截断提示)、`done` 等事件。
6. **后端代码重复**:`/code/stream` 与 `/code/refine` 的流式读取逻辑几乎重复。
7. **相邻 bug**:`generateDesign`(useGeneration)读取不存在的 `data.design` 字段。

## 设计决策(已与用户确认)

| 决策点 | 结论 |
|--------|------|
| 本轮重点 | 修复现状 + 可用性(不做大胆重构) |
| 流式体验 | 进度式:后端发轻量 `progress` 事件,前端渲染进度面板,隐藏原始 JSON |
| 多阶段处理 | CodePanel 工具栏提供阶段选择器,默认第一个阶段 |
| 进度方案 | 方案 A:正则提取 `"path"` 字段生成进度,最终文件仍由 `extractJson` 权威解析 |

## 详细设计

### 1. 后端 `apps/studio-api/src/routes/generate.ts`

#### 1a. 提取共享流式助手

新增 `apps/studio-api/src/lib/stream-llm.ts`,封装「fetch LLM → SSE 转发 → 解析 OpenAI 流 → 回调」的公共逻辑:

```ts
interface StreamLlmParams {
  llmConfig: LlmConfig;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  onChunk?: (delta: string) => void;
  signal?: AbortSignal;
}

interface StreamLlmResult {
  fullContent: string;
  finishReason: string;
}
```

`/code/stream` 与 `/code/refine` 复用该助手,消除重复的 fetch/reader/decoder 逻辑。

#### 1b. 进度事件(方案 A)

新增 `extractFilePaths(text: string): string[]`(放 `stream-llm.ts` 或 `lib/extract-file-paths.ts`):

- 用正则匹配 `"path"\s*:\s*"([^"]+)"`,按出现顺序去重,返回已出现的文件路径数组。
- 说明:每个 generatedFiles 数组元素开头必然有 `path` 字段,因此路径出现顺序 ≈ 文件生成顺序。`content` 内部虽也可能含 `"path":` 文本,但仅用于进度指示、不用于权威结果,可容忍少量误报(按位置与去重缓解)。
- 补充一个防御:仅收集不超过元素上限(如 100 个),防止恶意长流。

`/code/stream` 流式循环中,每当 `extractFilePaths` 返回的数组长度/内容变化(出现新路径),发 `progress` 事件:

```
event: progress
data: {"files": ["src/views/login/index.vue", "src/api/login.ts"], "current": "src/api/login.ts"}
```

结束时仍走现有 `extractJson(fullContent)` 解析,发 `files` 最终事件。**进度只是指示,最终以 `files` 事件为准**。

`/code/refine` 同样接入 `progress` 事件。

#### 1c. 客户端断连取消

- `/code/stream` 与 `/code/refine` 用 `AbortController` 作为上游 fetch 的 signal。
- 监听 `req.on('close')`,若客户端已断开则 `controller.abort()`,停止上游请求,避免后端继续消耗 token。
- 被中止时不发送 `error`(客户端已离开),直接 `res.end()`。

#### 1d. 相邻 bug:`design` 字段

- 后端 `/design` 路由响应未包含 `design` 字段,而前端 `generateDesign` 读取 `data.design`。
- 修复:前端 `generateDesign` 不再读取 `data.design`(或后端补该字段)。最小改法:删除对 `data.design` 的依赖,保留 `htmlContent`。

### 2. 前端

#### 2a. `apps/studio-web/src/hooks/useGeneration.ts`

- `generateCode(phaseId?: string)`:将 `phaseId` 透传到请求体;新增 `codePhaseId` 状态与 `setCodePhaseId`。
- 新增 `codeProgress` 状态:`{ files: string[]; current: string | null }`。
- SSE 解析新增事件:
  - `progress`:更新 `codeProgress`。
  - `warning`:存入 `codeWarning`(如 `'⚠️ 响应被截断,部分文件可能不完整'`)。
  - `done`:结束标记(可置 `codeDone` 或忽略)。
- 新增 `abortCodeGeneration()`:持有 AbortController,`abort()` 中断 fetch;生成开始时创建 controller,结束时释放。
- `refineCode` 同步接入进度与 warning 处理。
- 取消后清空 `codeProgress`/`codeWarning`。

#### 2b. `apps/studio-web/src/components/CodePanel.tsx`

- **修复编译错误**:补上 `const [refineOpen, setRefineOpen] = useState(false)` 与 `const [refineFeedback, setRefineFeedback] = useState('')`。
- **新增 props**:
  ```ts
  phases?: Array<{ id: string; name: string }>;
  selectedPhaseId?: string;
  onPhaseChange?: (phaseId: string) => void;
  codeProgress?: { files: string[]; current: string | null };
  codeWarning?: string | null;
  onCancel?: () => void;
  ```
- **阶段选择器**:当 `phases.length > 1` 时,工具栏显示原生 `<select>`(与 HeroUI 主题一致),选项为各阶段 name;生成时使用所选阶段。单阶段时隐藏,避免干扰。
- **进度式生成视图**:生成/精炼中,原「原始 JSON 文本流」区域替换为进度面板:
  - 标题:`正在生成第 N 个文件`,N = `codeProgress.files.length + 1`。
  - 当前文件名:`codeProgress.current`。
  - 已完成文件清单:逐项渲染,带 ✓ 标记。
  - 细进度条(宽度按已完成数变化,不依赖精确总数)。
  - 原始 JSON 文本不再展示。
- **取消按钮**:生成/精炼中显示「取消」,点击调用 `onCancel`。
- **截断提示**:`codeWarning` 非空时,在进度面板上方显示黄色横幅提示。
- 文件生成完成后自动选中第一个文件(若当前未选中)。

#### 2c. `apps/studio-web/src/App.tsx`

- 向 `<CodePanel>` 传入:
  - `phases={docHook.document?.phases}`
  - `selectedPhaseId={generation.codePhaseId}` / `onPhaseChange={generation.setCodePhaseId}`
  - `onGenerate={(phaseId) => generation.generateCode(phaseId)}`
  - `onCancel={generation.abortCodeGeneration}`
  - `codeProgress={generation.codeProgress}` / `codeWarning={generation.codeWarning}`

### 3. 数据流与错误处理

- 生成:`点「生成代码」→ POST /code/stream {sessionId, profileId, phaseId} → SSE start → progress* → files → end`。
- 阶段:`phaseId` 默认取所选阶段;无多阶段时后端仍默认 `'P1'`。
- 截断:`finish_reason=length` → 后端发 `warning`;仍尝试 `extractJson` 解析部分 JSON 并展示已生成文件;前端显示截断横幅。
- 取消:前端 abort → 浏览器断开 → 后端 `req.on('close')` 取消上游请求,不产生伪错误。
- 网络/LLM 错误:`error` 事件 → 前端错误提示,保留已生成的部分(若有)。

### 4. 测试与验证

- `extractFilePaths` 单测:覆盖多文件、转义引号、截断文本、去重。
- `pnpm typecheck` 与 `pnpm lint` 通过(api + web)。
- 手动冒烟:真实跑一次多阶段生成,验证进度展示、阶段选择、取消、精炼、截断提示。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `apps/studio-api/src/lib/stream-llm.ts` | 新增:流式助手 + `extractFilePaths` |
| `apps/studio-api/src/routes/generate.ts` | 复用助手、加 progress 事件、断连 abort |
| `apps/studio-web/src/hooks/useGeneration.ts` | phaseId 透传、progress/warning 处理、abort、修 design bug |
| `apps/studio-web/src/components/CodePanel.tsx` | 修编译错误、阶段选择器、进度面板、取消按钮、截断横幅 |
| `apps/studio-web/src/App.tsx` | 透传新 props |

不含无关重构。
