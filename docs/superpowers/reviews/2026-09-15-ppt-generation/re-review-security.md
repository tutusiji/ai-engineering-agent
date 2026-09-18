# 安全限定复审报告（re-review-security）— a6968c4..295213e

- 审查对象：`review-a6968c4..295213e.diff`（单提交 295213e，8 文件，+228/-19）
- 审查方式：限定安全复审，逐项对照 `rereview-fix-brief.md` Fix 1-4；在 worktree 内独立读代码核验攻击链闭合（不信任实施者报告）：theme→build 全部调用点 grep、持久化链路逐跳追踪、前端 RunHistory/PptPanel 渲染路径核验、种子 SQL 对照、既有测试主题形状核对。未重跑测试（实施者已报绿：typecheck 0、pptx-core 20、collector 16、pptx-builder 5、workflow-core 7、persistence 6、studio-api 44；测试数量自洽性已核对——workflow-core 7 = 既有 ppt-workflow.test 2 + 新增 plugin-runner.test 5）。
- 结论速览：**ADDRESSED**。发现计数：Critical 0 / Important 0 / Minor 1 / 备注 3。

---

## 一、攻击链闭合论证（独立验证）

原 Important 1（认证后任意文件读取）的两条子向量逐条验证：

### 子向量 1「不带 themeId，客户端 assetBasePath 原样透传」— 已闭合

- **唯一 theme→build 通道**：grep 全仓，`pptxBuilderPlugin.execute` 生产调用点仅 `plugin-runner.ts:381`；theme 实参为 `resolveThemeForBuild(theme, state.context.input?.themeId, artifactStore.getBaseDir())` 的返回值（:380），组装进 `{ content, theme: themeForBuild }`（:394）。旧的分支内联注入代码已整体删除。
- **无条件剥离**：`resolveThemeForBuild`（plugin-runner.ts:59-77）函数体第一步即整体浅拷贝并 `delete themeForBuild.assetBasePath`（:61-62），此后无任何分支能重新带入客户端值——注入成功时写入的是 `path.resolve(baseDir, 'templates', themeId, 'assets')` 服务端派生值（:71-73），注入失败/无 themeId/themeId 非字符串时函数直接返回不含该键的对象。所有分支均经过该删除，无提前 return 保留键的路径。
- **theme 非对象的退化分支**：`runSinglePluginNode` 对 falsy theme 先抛错（:374）；truthy 非对象（字符串/数组）经 `{ ...theme }` 展开为普通对象，`delete` 无害，`build.ts:230` 的 `theme.assets?.coverImagePath` 得 undefined → 不读取。无崩溃、无泄漏。
- **引用语义**：浅拷贝不改动 `state.context.input.theme` 原对象；嵌套 `assets` 共享引用但从未被写。客户端原始 input（含 assetBasePath）不落库——`RunStore.create` 的 INSERT 列（persistence/runs.ts:75-76）无 input 列，run.result 只装 nodeResults。
- **其余键排查**：`PptTheme` 全部路径型键仅 `assetBasePath` 与 `assets.{backgroundPath, coverImagePath}`（pptx-core/types.ts:30-34, 79）；`computeFitting` 只用 `layoutDensity`，`renderSlide` 只用 colors/fonts。嵌套 `assets` 的文件名不剥离但由闸 B 收口（见子向量 2）。
- **闭环冗余**：即使假设客户端 assetBasePath 漏过闸 A，`build.ts:230-233` 要求 `assetName && theme.assetBasePath` 双条件才读取——闸 A 删除该键后构建侧读不到，且「无 assetBasePath 直读」旧分支已删除（原 `join(...) : assetName` 的裸读路径不复存在），绝对路径 `coverImagePath` 无法触达 readFile。

### 子向量 2「带 themeId，文件名 ../ 经 join 归一化逃逸」— 已闭合

- **入口收窄（Fix 3 联动）**：themeId 先经形态钳制（plugin-runner.ts:64-68）——内置白名单 ∪ UUID 正则（`/^[0-9a-f]{8}-...$/i`，不含路径字符），`'x/../../templates/y'` 两边都不命中 → 视为注入失败 → theme 不含 assetBasePath → 构建侧纯色。能到达闸 B 的 assetBasePath 只能是服务端派生值。
- **目录闭合校验（闸 B）**：`resolveConfinedAssetPath`（build.ts:37-44）`resolve(base, assetName)` 后校验 `resolved === base || resolved.startsWith(base + sep)`。逐攻击形态核验：
  - `../..` 折叠越界 → resolved 落在 base 外 → undefined → toDataUri 现有 catch 语义静默降级纯色（不抛错）；
  - **assetName 为绝对路径**（`/etc/passwd`）：`resolve(base, '/etc/passwd')` 按第二参数绝对语义整体替换为 `/etc/passwd` → 不满足前缀 → undefined；
  - **兄弟目录前缀混淆**（base=/a/b，resolved=/a/bc）：`base + sep` 分隔符边界拦截，不误放行；base 自身经 resolve 归一化无尾随 sep，与校验式一致；
  - **空串/目录本身**（resolved === base）：可过校验但 `readFile(dir)` 抛 EISDIR → toDataUri catch → 降级，无泄漏；
  - **相对 assetBasePath**：`resolve(assetBasePath)` 与 `resolve(base, assetName)` 同以 cwd 为基准，闭合语义自洽；且生产路径 assetBaseDir 来自 `ArtifactStore.getBaseDir()` 为绝对路径（store.ts:159），无 cwd 漂移实际暴露面。
- **正向回归证明**（brief 要求的合法资产不受影响）：
  - build.test.ts 新增「回归底线」断言：base 内真实 1×1 PNG 经闸 B 嵌入，media 字节与源 PNG **逐字节相等**——合法形状通过；
  - 内置主题：迁移 002 种子的三个 theme JSON 均无 `assets` 键（已逐行核对 SQL），注入路径后 `theme.assets?.` 为 undefined → 不读取，行为不变；
  - 上传模板：`parseTemplate` 资产名 `path.basename` 化（parse.ts:116），`theme.assets` 值为纯文件名（parse.ts:126,142），落点 `<base>/templates/<uuid>/assets/`（ppt.ts:78-82）与注入路径逐字一致 → 经闸 B 正常读取。
- **无合法调用方依赖被移除分支**：grep 全部 `buildPptx`/`toDataUri` 调用点——生产仅 pptx-builder:81（theme 恒为闸 A 产物）；`scripts/ppt-e2e.ts:236` 直调 buildPptx 用 BIZ_BLUE_THEME（无 assets/assetBasePath，:52-66）；:294 工作流 input 同主题走闸 A；builder.test.ts THEME 无 assets（:11-27）。toDataUri 为 build.ts 私有函数无外部调用。移除确属同一攻击链（原 Important 1 子向量 1 的兄弟入口），且无合法依赖。

**结论：Important 1 的读取链已双闸闭合，且有正/负向单测证明。**

---

## 二、逐项核验表

| 项 | 核验结果 | 说明 |
|----|----------|------|
| Fix 1 闸 A | 通过 | plugin-runner.ts:59-77 无条件剥离 + 仅注入成功写服务端派生路径；唯一生产调用点 :380；旧内联代码删除；CLI runner（llm-runner.ts:152,155）共用 runPluginNode 同受保护。5 条单测覆盖无 themeId/UUID 成功/内置白名单/折叠拒绝/非字符串。 |
| Fix 1 闸 B | 通过 | build.ts:37-44 resolve + `base + sep` 前缀闭合校验，越界返回 undefined 复用静默降级；「无 assetBasePath 直读」分支移除经全调用点 grep 核实无合法依赖（论证见上节）；中文注释明确「最后一道闸」定位（:29-35）。负向（越界零 media + 全包无逃逸标记字节）与正向（合法 PNG 字节相等）测试齐备。 |
| Fix 2 | 通过 | `stripResultArtifacts`（workflows.ts:44-49）套在 `runPlugin`（:195）与 `runPluginGroup`（:213）两处——plugin/pluginGroup 全部节点覆盖；executor 将回调返回值原样存入 nodeResults（executor.ts:99-100，runNode 经 :220-222 委派适配器），`runStore.update(runId, { result: nodeResults })`（workflows.ts:269）即 JSONB 持久化点 → **剥离在持久化之前**，非仅 API 层。stage 级持久化的 `result.output` 本就不含路径（pptx-builder output 仅 artifactId/pageCount/warnings）。前端独立核验：PptPanel.tsx:1441 下载链接 `${API}/runs/${buildRunId}/artifacts/deck.pptx` 按 runId 拼接；RunHistory.tsx 产物树走 `/runs/:id/artifacts` 独立端点（:302, :361）；result 页签 `JSON.stringify(detailRun.result, null, 2)`（:733）纯字符串化渲染、无属性解引用——剥离不致崩。studio-web 全域 grep 无 `run.result.artifacts` 解引用。 |
| Fix 3 | 通过 | `BUILTIN_PPT_TEMPLATE_IDS`（ppt-templates.ts:17-21）= 种子 SQL 002_ppt_templates.sql 三行逐字一致（theme-business-blue / theme-tech-dark / theme-minimal-light），经 persistence/index.ts 导出。不合规 themeId → 注入失败 → 纯色兜底，失败路径无任何 throw（`path.resolve` 对任意字符串不抛）。归属校验不可行属实：WorkflowRunState 不携带 run 归属用户，按 brief 取格式钳制为既定兜底。UUID 形态无路径字符，注入落点 confinement（:69-72 尾随 sep 前缀）恒过但保留为纵深防御，正确。 |
| Fix 4 | 通过 | `stripAssetBasePath`（ppt-templates.ts:29-34）null/非对象/数组原样返回不崩，普通对象浅拷贝删除；应用于 `rowToTemplate`（:44），get（:63）与 listByOwner（:57）两条读路径全覆盖（GET /themes 及模板消费方全走此处）。写侧核验：上传 theme 为服务端构造（parse.ts:149-165 不可能含 assetBasePath，ppt.ts:89-92 spread 无害）→ 新行干净，读侧剥离精确覆盖 a4c11f0 前存量行。测试真实执行：create 写入带 assetBasePath 的 theme → `store.get()` 走 rowToTemplate → 断言剥离且 name 保留。 |
| 范围 | 通过 | 8 文件逐一归属：workflows.ts=Fix 2；build.ts+build.test.ts=Fix 1B；plugin-runner.ts+plugin-runner.test.ts=Fix 1A+3；ppt-templates.ts+ppt-template-store.test.ts=Fix 4+3 常量；persistence/index.ts=Fix 3 导出配套。无夹带（brief 明令不动的 gitignore 空行等均未触碰）。 |
| 规范 | 通过 | 新增注释全中文（含 brief 点名的「最后一道闸」注释）；diff 无 `any`（泛型 `T extends { artifacts?: unknown }` 收敛）；单一 `fix:` 提交，中文提交信息 + `Co-Authored-By: Claude Code <noreply@anthropic.com>` 尾注（已核验提交全文）。 |

---

## 三、发现

### Critical 0 / Important 0

无。Important 1 两条子向量均闭合（论证见第一节），未发现新的同族可达入口。

### Minor 1 — 存量 run.result 行仍残留 artifacts[].path，GET /runs/:id 照原样下发

- 位置：`apps/studio-api/src/routes/runs.ts:48-56`（整行下发）× `packages/persistence/src/runs.ts:60-61`（rowToRun 原样透传 result）。
- 说明：Fix 2 在持久化前剥离，但本修复之前已落库的 run 行，其 `result.<plugin节点>.artifacts[].path` 仍为服务器绝对路径，读取侧无过滤（对比：Fix 4 对存量 theme 行做了读侧剥离，同类存量数据两类处理不对称——该不对称源自 brief 对 Fix 2 的范围界定仅「持久化前剥离」，故不阻断）。
- 影响：低——绝对路径泄露给可查看该 run 的认证用户，与原 Minor 2 同级。
- 修法：读侧在 RunStore rowToRun（或 runs 路由）遍历 result 节点删除 `artifacts` 键，或一次性数据订正。建议随下次触碰 persistence 时顺带处理。

### 备注（不计级）

1. `/uploads` 响应（ppt.ts:150）将 `saveBinary` 返回的服务器绝对路径下发浏览器，客户端再作为 `input.filePath` 回传 collector——存量行为，两轮复审与 brief 均未列入，泄露对象仅上传者本人且 collector 侧有 a2e69dc confinement 兜底、持久化输出仅 basename（ppt-source-collector/index.ts:230）。可选的后续收敛点，不属本次范围。
2. 闸 B 为词法校验（不追 realpath）：若 assets 目录内被植入指向外部的符号链接仍可读出——资产目录由服务端全权写入（内置种子 + 上传解析的常规文件），无用户可控的建链入口，符合 brief「符号链接之外」的范围界定，接受。
3. `BUILTIN_PPT_TEMPLATE_IDS` 为硬编码常量而非读库：若未来迁移新增内置主题而漏改常量，新主题资产注入将失败——**fail-closed**（走纯色兜底），仅功能性问题非安全问题；常量注释已指向种子 SQL 提示同步维护。

---

## 四、结论：**ADDRESSED**

理由：

1. **Important 1（任意文件读取）双闸闭合**：闸 A 在唯一 theme→build 通道入口无条件剥离客户端 assetBasePath（唯一生产调用点核实，无旁路）；闸 B 在读取前做 resolve + 分隔符边界的目录闭合校验，绝对路径/折叠逃逸/兄弟前缀/目录自身各形态逐核验均拒绝或无害降级；「无 assetBasePath 直读」旧分支的移除经全调用点 grep 证实属同一攻击链且无合法依赖。正/负向单测齐备（越界零媒体 + 无标记字节；合法 PNG 字节级相等）。
2. **Minor 2/3/4 按 brief 落实**：Fix 2 剥离点在 JSONB 持久化前且覆盖全部 plugin 节点，前端渲染路径独立核验不会因剥离崩溃；Fix 3 白名单与种子逐字一致、不合规走纯色兜底不崩 run；Fix 4 读侧剥离覆盖全部读路径且对畸形 theme 安全，测试断言真实执行。
3. **无夹带、规范合规**：8 文件全部落在 4 项范围内，中文注释、无 any、单一 fix 提交 + 尾注均核验通过；实施者报告的测试数量与仓库实际测试文件构成自洽。
4. 唯一遗留（Minor 1，存量 run.result 行的读侧过滤）源自 brief 对 Fix 2 的范围界定，属同类低敏感泄露的存量清理问题，不阻断本修复采纳。
