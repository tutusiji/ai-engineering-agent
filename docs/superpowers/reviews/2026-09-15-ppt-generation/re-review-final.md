# 复审报告（re-review-final）— aef352e..a6968c4

- 审查对象：`review-aef352e..a6968c4.diff`（10 提交，19 文件，+413/-105）
- 审查方式：聚合 diff 逐 hunk 通读 + 逐提交 `git show` 归属核对 + 关键跨文件语义核实（ArtifactStore.saveBinary 返回值、RunStore.complete 语义、WorkflowNodeResult 持久化链路、agent-runner normalize 异常路径、collectSource 生产调用点、WorkflowRunSchema 校验强度）。未重跑测试（实施者已报绿：pptx-core 18/18、collector 16/16、pptx-builder 5/5、studio-api 44/44）。
- 结论速览：第一部分 **ADDRESSED**；第二部分 **REJECTED**（1 Important，修复后复审）。
- 发现计数：Critical 0 / Important 1 / Minor 3 / 备注 3。

---

## 第一部分 — 修复提交 a6968c4（终审 10 项 + /themes 口径补齐）

### 逐项核验表

| 项 | 核验结果 | 说明 |
|----|----------|------|
| A DELETE 清理资产目录 | 通过 | `apps/studio-api/src/routes/ppt.ts:119-133`：delete 成功后 rmSync(templates/<id>)，包 try/catch 仅 console.warn，删除响应仍 200——「清理失败不回滚」语义与 brief 一致。穿越疑虑排除：rmSync 前有 templateStore.get/delete 的 DB 行校验，伪造 id 含 `../` 会在 404 处终止，到不了 rmSync。新增测试覆盖（手工落资产目录→断言删净→finally 兜底清理）。 |
| B /uploads 补 req.user | 通过 | `ppt.ts:140-143`：`!req.user` 并入 400 校验，文案「缺少 name、fileBase64 或未认证」与 /templates 逐字同款，状态码一致。 |
| C 死三元 | 通过 | `packages/pptx-core/src/build.ts:201-204`：`width: 10` + 注释「宽固定 10 英寸，4:3 仅高度不同」，与 brief 给定注释一致。 |
| D presentation.xml 守卫 | 通过 | `packages/pptx-core/src/parse.ts:97-101`：先取值判空，中文错误文案对齐 theme1.xml 守卫风格（说明仅支持未加密 OOXML）。新增「缺 presentation.xml 报明确错误」测试。 |
| E y 轴 epsilon | 通过 | `plugins/ppt-source-collector/src/index.ts`：`Math.abs(y - lastY) > 0.5` + 中文注释说明 0.5pt 容差吸收亚像素抖动。理论备注见备注 3。 |
| F try/finally 销毁 doc | 通过 | 页循环包 try、`finally { await doc.destroy(); }`，无 catch——错误原样向上传播，语义保持。 |
| G BINARY_EXTS 提升 | 通过 | `apps/studio-api/src/routes/runs.ts:23-24` 提升至模块顶层并带中文 JSDoc；集合内容与原处理器内定义逐字一致。 |
| H 500 通用文案 | 通过 | DELETE 与 /uploads 两处 catch 改 console.error + 通用文案，与 /themes 写法完全对齐（含日志）。/themes catch 的 String(err) 直出一并补齐——brief 背景称 /themes「已改」但 aef352e 实际未改，任务说明已认定该 amend 属修复范围，非夹带。 |
| I 413 文案 | 通过 | `PptPanel.tsx` 两处改为 base64 语义文案（模板/素材主语区分、句式一致），与 brief 建议句式吻合。 |
| J exit 竞态 | 通过 | `scripts/ppt-e2e.ts:383-395`：失败分支 `process.exitCode = 1; return;`、catch 尾部置码；全文 grep 无残留 `process.exit`；exitCode 置码后无后续异步改写，控制流正确（置码后 main 自然 resolve）。 |

### 无夹带核查与全局约束

- a6968c4 触碰 9 文件 = A-J 所涉 7 文件 + 2 个测试文件；逐 hunk 核对，改动仅为 A-J 与配套测试，无清单外顺手改动。brief 明令「不要动」的已修逻辑（MIME 推断、notes 全版式写入、pollRun 容错）未被触碰。
- 新增注释全中文；无 `any`（catch 形参无标注为 TS 语言限制，与全文件既有风格一致）；单一 `fix:` 提交，提交信息中文 + Co-Authored-By 尾注。

### 结论（第一部分）：**ADDRESSED**

10 项修法逐项与 brief 一致：A 的失败不回滚、B 的口径对齐、E 的 0.5pt 容差、F 的错误传播保持、J 的控制流均按指定落实；无夹带、无新破损，测试同步补齐。

---

## 第二部分 — 用户 9 提交 a5527b8..0f0e823（首次审查）

### 逐提交核验表

| 提交 | 核验结果 |
|------|----------|
| a5527b8 collector lint | 通过。ENOENT 抛错补 `cause` 保留错误链；`let markdown: string;` 去初始化的定赋值成立——switch 三 case 全部赋值或抛错且含 default 抛错（`index.ts:216-243`），TS 可证。 |
| 6cbb654 gitignore | 通过。sample.pptx 生成于 repoRoot（`scripts/ppt-e2e.ts:237`），忽略条目位置正确。备注 1：注释块前缺空行（纯格式）。 |
| 4ed8dc3 产物目录对齐 + 失败状态 | 通过。executor 新增 `runId` 覆盖（`executor.ts:43-45, 81-82`），路由注入持久化 run id——pptx 经 `saveBinary(runId, 'deck.pptx')` 落 `<base>/<runId>/deck.pptx`，与下载路由 `/runs/:id/artifacts/deck.pptx` 对齐（修复下载必然 404）。终态收尾：failed 走 `complete(runId, msg)` → RunStore.complete(error) 置 failed（`persistence/runs.ts:168-179`），不再被无参 complete 覆盖成 completed；waiting-approval 不收尾（等待审批回调），正确。失败文案「节点 X 执行失败」偏泛，但 fitting 明细经 validation.issues 已在前端展示，可接受。 |
| a2e69dc uploads 路径约束 | 通过（本职）。`plugin-runner.ts:314-322`：resolve + 尾随 `path.sep` 前缀校验。空 filePath 拒绝；`../` 经 resolve 折叠后拒；兄弟目录（`uploads-evil`）因 sep 后缀不误放行；saveBinary 返回绝对路径（`store.ts:154-163`），无 cwd 依赖；collectSource 生产唯一调用点即此 choke point（group 分发不经过 collector）。约束本身有效——但同族攻击面未闭合，见发现 1。 |
| 12e49a6 文件名清洗 | 通过。`sanitizeFileName`（`ppt.ts:27-32`）basename 归一后拒绝空串/`.`/`..`，saveBinary join 逃逸路径封死；theme.name 改用上传文件名去 `.pptx` 后缀（`ppt.ts:89-92`），修复所有上传模板同名 'template'。 |
| 8ab8905 空大纲防线 + 钳位 | 通过。normalize 内 throw → agent-runner catch 转 `ok:false`（`agent-runner.ts:76-81`），中文错误直达前端，0 页损坏 pptx 不再误报成功；content-polish pageType 钳位与 outline skill 同构，防预算表查 undefined 崩构建。 |
| 69bb191 告警去重 + 路径泄漏 | 部分通过。computeFitting 每页至多一处、bulletCount=0 短路 continue，页数语义与阈值对齐，测试同步更新；output 摘除 path。但 `artifacts:[artifact]` 的绝对路径仍入 run result——发现 2。 |
| a4c11f0 themeId 注入 + 背景图 + MIME | 部分通过。themeId 派生目录 confinement（尾随 sep 前缀校验，`plugin-runner.ts:336-345`）；theme 不再入库/下发绝对路径；背景图限图片扩展名；toDataUri 按扩展名推断 MIME（jpeg/gif/bmp/png）。精炼路径核验：handleRefine 不传 themeId 但 outline 工作流不消费该字段，构建用的是 outlineParamsRef 快照中的 themeId，无功能缺口。遗留问题见发现 1、3、4。 |
| 0f0e823 工坊 UI/UX | 通过。步骤指示器四态映射正确、aria-current/aria-label 用法妥当；pollRun 连续 3 次容错（`PptPanel.tsx:343-372`）成功即重置计数、终态与超限均正确收口；启动 POST 纳入取消令牌（`401-410`）——含连点竞态核验（旧 startToken 被下一次 cancelPoll 取消，迟到响应被丢弃），孤儿轮询关闭；doneWarnings 生命周期完备（完成写入、restart 清空、仅 done 视图渲染）；全局 focus-visible 焦点环不影响鼠标点击；ThemeToggle 入口移除为有注释说明的产品决策、组件保留待恢复。 |

安全专项（任务点名 a2e69dc/12e49a6 能否拦住穿越）：uploads 侧——能拦（展开见上表）；theme 资产侧——themeId 注入能拦目录逃逸，但文件名与客户端 assetBasePath 未拦，见发现 1。

## 发现

### Important 1 — 主题资产读取路径未闭合，仍存在认证后任意文件读取

- 位置：`packages/pptx-core/src/build.ts:210-213`（join 后直读，无 confinement）；`packages/workflow-core/src/plugin-runner.ts:333-345`（仅约束 themeId 派生目录）。
- 链路：workflow input.theme 全程客户端可控（`WorkflowRunSchema` 仅为 `params: z.record(z.unknown())`）→ plugin-runner → pptx-builder → buildPptx → `toDataUri(readFile(join(assetBasePath, assetName)))`，中间无任何路径校验。
- 两条可达子向量：
  1. **不带 themeId**：plugin-runner 原样透传客户端 theme.assetBasePath——攻击者直接给 `assetBasePath: '/'` + `coverImagePath: 'etc/passwd'`（或应用 .env 等相对路径）。
  2. **带 themeId**：目录被约束在 `templates/<id>/assets`，但文件名 `coverImagePath`/`backgroundPath` 含 `../..` 可经 join 归一化逃逸目录。
- 影响：服务端进程可读文件的字节被 base64 内嵌进攻击者自己的 deck.pptx（pptxgenjs 不解码 data URI，任意字节均可嵌入），经 `/api/runs/:id/artifacts/deck.pptx` 取回。构建节点执行即触发（生产环境具备 LLM key）。若读得应用 .env（含 getJwtSecret 的 JWT_SECRET 来源），可伪造任意用户 JWT → 鉴权体系整体失守。单用户本地部署影响有限；多用户部署接近 Critical。
- 定性：向量本身为存量（a4c11f0 之前客户端 theme JSON 即可触达），但 a2e69dc/a4c11f0 以「任意文件读取防护」「themeId 不能作为任意目录读取的入口」为主旨，却留下同一条读取链上直接可达的兄弟入口，故按本次审查标准计 Important。
- 修法：plugin-runner 无论如何一律丢弃客户端 assetBasePath（themeForBuild 仅在服务端注入成功时携带该键）；在 build.ts（或 builder 层）join 后 `path.resolve` 并校验 `startsWith(resolve(assetBasePath) + path.sep)`，越界复用 toDataUri 现有 catch 语义静默降级纯色。

### Minor 2 — 绝对路径仍经 artifacts 字段泄入 run result（69bb191「移除路径泄漏」未闭合）

- 位置：`plugins/pptx-builder/src/index.ts:101-102`（`artifacts: [{ path: outPath }]` 为服务器绝对路径）→ `workflows.ts:178, 254`（runPlugin 返回的 PluginResult 原样进 nodeResults 并 JSONB 持久化，`as unknown as JsonObject` 仅为编译期断言，JSON.stringify 保留 artifacts 键）→ `runs.ts:47-54` GET /runs/:id 整行下发浏览器。
- 影响：认证用户可从 `run.result.pptx_build.artifacts[0].path` 读到服务器绝对路径（低敏感信息泄露）；但使提交声明的「移除路径泄漏」不完整，且终审 Ruling 8 的「运行时透传无碍」前提在 run.result 持久化 + API 下发事实下不再成立。
- 修法：持久化前剥离 artifacts（或映射为 `{id, kind}`）；前端下载链接用 buildRunId 拼接，不依赖该字段。

### Minor 3 — themeId 未做归属/格式校验

- 位置：`plugin-runner.ts:336-345`。任意字符串只要 resolve 后落点在 `templates/<x>/assets` 内即放行（含 `'x/../../templates/y'` 折叠后仍合规的形态），可读他人上传模板的图片资产。仅图片、需认证、用于自建 run，影响很低。
- 修法：注入前经 PptTemplateStore 校验 themeId 为 builtin 或本人模板 id（或钳制 UUID 形态）。

### Minor 4 — 存量上传模板 theme JSONB 仍带绝对 assetBasePath

- a4c11f0 只改写入侧：a4c11f0 之前创建的行经 GET /themes 仍把绝对路径下发浏览器并进 LLM prompt。一次性数据订正（UPDATE 剥离 `theme->assetBasePath`）或读侧过滤即可。

### 备注（不计级）

1. `.gitignore` 新注释块前缺空行（6cbb654，纯格式）。
2. J 项置码自然退出后，若脚本留有 keep-alive 连接，进程退出会延迟数秒（无正确性问题，符合 brief 指定做法）。
3. E 项 epsilon 判换行存在链式漂移的理论合并可能（相邻项逐对差 ≤0.5pt 时长串合并为一行）；实际行距远大于阈值，按 brief 执行无异议。

## 结论

- **第一部分（a6968c4）：ADDRESSED** —— 10 项修复与 brief 逐项吻合（A 失败不回滚、B 口径对齐、E 0.5pt、F 传播保持、J 控制流均正确落实），无夹带（9 文件逐 hunk 核对），无新破损，测试同步补齐，全局约束（中文注释 / 无 any / 单一 fix 提交 / 提交格式与尾注）全部满足；/themes catch 补齐属任务说明认定的 amend 范围。
- **第二部分（a5527b8..0f0e823，9 提交）：REJECTED** —— 工程质量整体良好（9 提交逐项核验 7 项全通过、2 项部分通过），但存在 1 项 Important：主题资产读取路径未闭合的认证后任意文件读取（存量向量，位于本次安全加固提交的直接射程内、与其声明部分重叠）。按本分支既有审查标准（Important 阻断合并，终审即以 3 项 Important 给出 With fixes），需修复发现 1（建议连同发现 2 一并处理，均为小改动）后复审；其余提交本身无需改动。
