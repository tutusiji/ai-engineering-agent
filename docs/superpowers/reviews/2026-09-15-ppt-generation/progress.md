# SDD ledger — plan: docs/superpowers/plans/2026-09-15-ppt-generation.md

- 工作区: .claude/worktrees/ppt-generation（分支 worktree-ppt-generation，含 3d5684e 文档提交）
- spec: docs/superpowers/specs/2026-09-14-ppt-generation-design.md（权威）；plan 两处有意偏离已在 plan header 记录

## 预检冲突扫描（2026-09-15，BASE=3d5684e）

| 任务对 | 产出 → 消费 | 发现 | 裁定 |
| --- | --- | --- | --- |
| T1→T2/T5/T6/T7/T8 | 4 合约 Schema + FileSchemaRegistry 文件名约定 | 无：ppt-source/ppt-outline/ppt-theme/ppt-content 命名全程一致 | — |
| T2→T3/T4 | getSlideBudget 预算表、包骨架 | 无：同包内依赖 | — |
| T2→T5 | 预算表数值 | skill prompt 内嵌同表数值=文本重复（LLM 约束需字面数值；代码侧单一事实源为 getSlideBudget） | Ruling: 接受 prompt 内嵌——数值以 T2 表为唯一基准，T5 审查时逐值比对；错则大纲越预算，buildPptx 兜底缩字号 |
| T5→T6 | collector 输出顶层 spread 出 input.markdown | 无：T5 素材读取为 input.markdown ?? input.source?.markdown | — |
| T6/T7→T8 | 节点 id source_collect/outline_planning/content_polish/pptx_build | 无：YAML 与 plugin-runner 分支 id 一致 | — |
| T7→T9 | plugin-runner 伪 artifacts(publish) → 真 ArtifactStore(saveBinary) | 无：T7 仅守卫回退路径不触碰 sdk 类型，T9 加可选声明+真注入，时序无类型断裂 | — |
| T9→T11 | BINARY_EXTS 下载分流 / ArtifactStore | 无：不同文件 | — |
| T10→T11 | PptTemplateStore | 无 | — |
| T11→T12 | /api/ppt 端点形状 | 无 | — |
| T8 vs spec §7 | spec 单工作流+审批闸门 vs plan 两段工作流 | spec 闸门语义与 executor 非阻断事实（无暂停/恢复）冲突 | Ruling: 维持 plan 两段方案——闸门由前端在两次 run 之间承载（plan header 已记录、用户已认可方向）；错则需重写 T8/T12 交互段 |
| 全部 | Global Constraints | 新包 type:module+workspace:*（T2-T4）、前端三态/防重复/二次确认（T12）均已写入任务文本 | — |

## 任务进度
Task 1: complete (commits 3d5684e..e8cc0c3, review clean; ⚠️ 项已核销：提交尾注在、typecheck 绿)
Task 1: minor (deferred): 合约测试缺负向断言（仅 ppt-source 正向调 registry.validate）——brief 原文即如此，终审裁决
Task 1: minor (deferred): 报告 RED 段为转述非原样输出（GREEN 证据充分，不影响有效性）——后续任务 dispatch 附带"报告粘贴原始输出"要求
Task 2: complete (commits e8cc0c3..80a91f8, review clean; ⚠️ 项已核销：提交尾注在；预算表 21 值逐值核对通过)
Task 2: minor (deferred): packages/pptx-core 缺包级 tsconfig.json（过滤 typecheck 靠 tsc 祖先回退，与同级包不一致）——plan 文件列表层面遗漏，终审裁决；T6/T7 新建插件包时 carry 此点
Task 2: minor (deferred): 预算表测试仅 content-bullets 覆盖密度变化（brief 逐字要求所限），Math.max(1,...) 下限未断言
Task 3: Ruling: 接受 2 处 brief 偏离——① toTextProps 包装（pptxgenjs 4.0.1 addText(string[]) 运行时抛 TypeError，brief 逐字代码在该版本上不可用，与 brief 预授权的 addShape 修正同类）；② coverImg 按 brief 注释自身要求简化为一次解析。runtime 正确性高于逐字转写；错则渲染器在真实 pptxgenjs 上崩溃
Task 3: Ruling: DONE_WITH_CONCERNS 的 tsx+pptxgenjs 静态导入崩溃在本任务内修复（实施者报告的方案 A：build.ts 改动态导入，三运行时已验证），理由：平台实际运行时为 tsx（plugin 进程内调用链），已知崩溃不进审查；错则 Task 7 的 pptx-build 工作流在线上必崩
Task 3: review round: spec ❌（Important×1）→ fix round 1
Task 3: Ruling: spec §11「buildPptx 自动缩字号兜底」由计划的有意替换承担（plan L1583/L1760：computeFitting 硬拦截 >2 警告 → run failed → 前端引导改大纲重跑，无静默缩字号）；预检表 T2→T5 行的「buildPptx 兜底缩字号」措辞系我笔误，以此裁定为准。残余风险：1-2 处警告的页可能轻微溢出，v1 接受；错则个别页排版局促，v1.5 可补缩字号
Task 3: ⚠️ 已核销：两提交尾注均在（grep=2）；报告将 pptx-builder 误写为 Task 8 系笔误不影响代码
Task 3: minor (deferred): build.ts:186 死三元（两分支同为 10）
Task 3: minor (deferred): toDataUri 硬编码 image/png MIME，.jpg 资产前缀错误
Task 3: minor (deferred): notes 仅两个内容路径写入，cover/toc/section/quote/ending 的 notes 静默丢弃（brief 原文如此）
Task 3: minor (deferred): 7 版式仅 2 个有自动化覆盖；建议 toc/content-two-col 断言 <a:p> 段落数
Task 3: fix round 1/5 (复审中——toTextProps 逐项 breakLine + withBullet 逐项 bullet，实施者实证修正了审查建议的统一 breakLine 方案会丢项目符号；新增段落计数回归锁 3 用例；commits fb867bf..8e77758)
Task 3: fix round 1/5 (1 addressed, 0 open——复审逐行核证 pptxgenjs 源码确认 ADDRESSED；新增段落计数回归锁)
Task 3: complete (commits 80a91f8..8e77758, review clean after 1 fix round)
Task 3: minor (deferred): content-bullets 空 polishedBullets 渲染游离符号点（brief 继承怪癖，非本次修复引入；终审记账）
Task 4: complete (commits 8e77758..ac51938, review clean; 3 处 brief 偏离均核证为实证正确：4472C4 兜底路径矛盾修正、Calibri Light 实际值、logo 提取补全；⚠️ 尾注已核销)
Task 4: minor (deferred): presentation.xml 缺失时非空断言抛英文错（plan 原文，建议补与 theme1.xml 对称守卫）
Task 4: minor (deferred): 背景图不校验文件类型（≥30KB 任意媒体文件可胜出，plan 原文）
Task 4: minor (deferred): 用色频次兜底只扫 slides 不扫 layouts/masters（brief 明确的 v1 局限）
Task 4: Ruling: accent 槽位无 OOXML 来源、提取主题恒用兜底 F59E0B——接受：v1 渲染中 accent 为辅助强调色，预设主题正常定义、提取主题用固定兜底可接受；错则提取模板强调色不还原（v2 版式复刻再修）
Task 5: Ruling: 偏离 1 语义采纳「首页缺省/非法 pageType 推断 cover，其余回落 content-bullets」——brief 实现代码与 brief 自带测试互斥，计划测试编码的意图（deck 首页即封面）为准；错则 LLM 畸形输出缺省时首页默认版式不同，normalize 兜底行为差异极小
Task 5: Ruling: 偏离 2-5 均接受——②brief 测试文件为嵌套 it 合并残迹（esbuild 无法解析），重构保留全部断言+补非法枚举用例；③notes 条件展开替代 undefined 直赋（TS2322，运行时等价）；④budgetLines join('\n')（数组插值逗号拼接错误）；⑤补 vitest devDep+test 脚本（brief Step 5 命令所需）
Task 5: complete (commits ac51938..c22787a, review clean; 预算表一致性由运行时引用 getSlideBudget 结构性保证；⚠️ 尾注已核销；反馈修订段确认在 Task 8 brief L143-163)
Task 5: minor (deferred): 非法 layoutDensity 会使 buildPrompt 崩溃（unchecked cast，建议一行守卫回退 standard；brief 原文）
Task 5: minor (deferred): polish skill pageType 直通不校验枚举（renderSlide 穿透安全，brief 原文）
Task 5: minor (deferred): audience 缺省输出 '' 而非 undefined（brief 原文，PptContent.audience 本为可选）
Task 6: 提交 db78176（10 files +734，含 plugin-runner 接线/workflow-core 依赖/tsconfig paths/lockfile）
Task 6: complete (commit db78176, review Approved 首审即过; ⚠️ 项已核销：提交尾注在; pdfjs-dist 5.7.284 engines ≥22.13 与 CI node 22 兼容经审查者 lockfile 核证)
Task 6: minor (deferred): collector index.ts:207 与 collector.test.ts:53 残留 pdf-parse 字样（应为 pdfjs-dist）
Task 6: minor (deferred): defaultParsePdf 页循环无 try/finally，getTextContent 抛错时 doc.destroy() 不执行
Task 6: minor (deferred): 无文本层 PDF（扫描件）仅有通用「素材过短」警告，无专门提示
Task 6: minor (deferred): y 轴合并浮点严格相等（y !== lastY），亚像素抖动拆行；y 变化时可能推空行
Task 6: minor (deferred): ENOENT/损坏文档分支与 defaultFetchPlatformDoc 模拟 DB 测试缺失（审查者确认披露留待 Task 8）
Ruling: Task 7 plugin-runner 分支用顶部静态导入（既有模式，同 collector 分支），不用 brief 草图的 await import —— pptxgenjs 在 build.ts 内函数级动态加载，静态导入 tsx 安全；与代码库一致优先
Task 7: complete (commit 039dc6e, review Approved 首审即过; ⚠️ 项已核销：提交尾注在; 五项披露偏离经审查者逐项对照源码核证为真且必要——ValidationReport 形状偏离避免必现编译错误)
Task 7: minor (deferred): bulletCount=0 页的杂散要点计 3 次警告（brief 草图 plan-mandated，计数噪音可放大越阈值；终审 triage）
Task 7: minor (deferred): ctx.workspaceRoot ?? process.cwd() 死代码（PluginContext.workspaceRoot 必填，brief 原文）
Task 7: minor (deferred): builder.test.ts 三例 mkdtempSync 无 afterEach 清理（每次跑测试留 3 个 tmpdir）
Ruling (carry): WorkflowNodeResult 补 validation?: ValidationReport（executor.ts:102 全量透传但类型缺失）→ 随 Task 8 的 workflow-core 触碰一起做，2 行加法、shared-types 已有依赖路径；artifacts 字段不加——下游消费 artifactId 已在 output 中，错则 Task 12 需 cast 读 warnings（可接受）
Task 8: complete (commit 3891694, review Approved 首审即过零实质问题; ⚠️ 项已核销：提交尾注在; YAML plugin/skill/schema 名经注册表逐一核证; lockfile 随 devDep 提交判定正确——frozen-lockfile 要求)
Ruling: Task 10 PptTemplateRow.createdAt 用 number —— brief Produces 段的 Date 系笔误，实现代码/RunStore Date.now() 约定/BIGINT 列三者一致；错则与其他 Store 时间戳类型不一致
Ruling: Task 10 迁移应用走 scripts/migrate.ts（既有 CLI，schema_migrations 幂等）——既有测试约定不在用例内跑迁移
Ruling: Task 11 /templates 路由 saveBinary 调用修正为 3 参签名（brief 草图 2 参与 ArtifactStore.saveBinary(runId, filePath, content) 矛盾，correctness > verbatim）
Ruling: Task 11 路由测试范围 = themes 3 builtin / DELETE 403·404 / uploads 往返 / 上传 400；happy-path 模板上传留 Task 13 e2e（避免 studio-api 引入 pptxgenjs 造 fixture）
Task 9: Ruling: 审查 Important（plan-mandated）saveBinary/readBinary 英文 JSDoc——brief 草图自带英文文本被我"逐字"裁定覆盖，系计划文本缺陷；裁定翻译为中文（CLAUDE.md 约束绝对优先于逐字条款），派修复轮 1
Task 9: fix round 1/5 (仅译两条注释，BASE=5cbb1ce)
Task 9: minor (deferred): runs.ts:126 Content-Disposition filename 未转义引号/未 RFC 5987 编码（brief 逐字；仅插件保存的文件名可达）
Task 9: minor (deferred): runs.ts BINARY_EXTS/ext 每请求重建（brief 逐字，可提升模块作用域）
Task 9: minor (deferred): plugin-runner 每节点执行 new ArtifactStore() 且隐式耦合默认 baseDir（审查者核证当前 server.ts:32 同为无参构造一致；若日后显式目录则分叉，终审评估）
Task 9: complete (commits 3891694..f581c44, review Approved 经 1 修复轮——英文 JSDoc 翻译, re-review ADDRESSED 零新破损)
Task 9: minor (deferred): store.ts 既有 deleteRun/getRunDir 英文 JSDoc（先于本任务存在的存量债务，复审 out-of-scope 提出，终审与全分支中文注释一致性一起评估）
平台事实: 开发环境双库——vitest/store 默认连 localhost:5432，根 pnpm migrate 经 .env 连远程库；Task 10 实证 002 只应用到 localhost，远程部署时 runMigrations() 自动补齐；Task 11/13 的 DB 测试与冒烟同落 localhost
Task 10: 提交 1298496（4 files +158；迁移幂等二次验证；5/5 绿）
Task 10: Ruling: rowToTemplate 英文 JSDoc 翻译为中文（与 Task 9 同一原则——PPT 新增代码中文注释绝对优先；runs.ts:45 等存量英文注释另行记账，终审统一评估）
Task 10: fix round 1/5 (仅译 rowToTemplate 注释，BASE=1298496)
Task 10: minor (deferred): 测试清理仅 happy path（用例内删除；中途失败残留随机 uuid 行无害，与既有测试同标准）
Task 10: complete (commits f581c44..e9a898d, review Approved 经 1 修复轮——rowToTemplate 注释翻译, re-review ADDRESSED 零新破损; ⚠️ trailer 已核销)
Ruling: Task 11 /uploads 与 /templates 的 name 传 saveBinary 前 path.basename 归一（带认证用户输入防路径穿越，与 runs.ts 路由守卫同标准；basename 后空则 400）——brief 草图未设防，correctness/security > verbatim
Ruling: Task 11 上传模板路由 ownerId 必须非空（!req.user → 400 既有检查为防线，对应 Task 10 审查者指出的 create null ownerId 不可见问题）
Task 11: 提交 74265e7（5 files +317；ppt-routes 11/11、studio-api 42/42；冒烟用 dev 回退密钥真实签发通过；冒烟服务器经 .env 幂等应用 002 至远程库——环境事实非缺陷）
Task 11: Ruling: 审查 Important（plan-mandated）——/templates catch-all 把 saveBinary/create 故障也返回 400 并泄露 err.message；裁定修复：parseTemplate 失败 → 400，存储/DB 失败 → 500 + 通用文案（兼防 create 失败后孤儿资产）——派修复轮 1
Task 11: minor (deferred): 模板行 id 与资产目录 id 不一致（Store.create 自生成 uuid 不接受 id 参数，继承自计划；渲染不受影响，DELETE 仅删行留孤儿目录；修复需 Task 10 store 加 id 参数——终审 triage；Task 12/13 不得假设资产在 templates/<row.id>/assets 下）
Task 11: minor (deferred): 10MB body 上限限制模板上传 ~7.5MB 解码后（平台标准非偏差；Task 13 e2e 用小模板，前端 413 映射友好提示——carry 到 T12/T13）
平台事实: pptx-core parse.ts:112 对模板资产 key 在进入 saveBinary 拼接前已做 basename——zip-slip 在解析层被中和（Task 11 审查者核证）；security.ts:49 express.json limit 10mb 全局生效
Task 11: complete (commits e9a898d..a51aeea, review Approved 经 1 修复轮——错误分层 400/500 + 孤儿资产清理 + 注释翻译, re-review ADDRESSED 零新破损; ⚠️ trailer 已核销)
Task 11: minor (deferred): /themes、DELETE、/uploads 的 catch 仍 String(err) 直出（与 /templates 新分层口径不一致，终审统一评估）
Ruling: Task 12 NEEDS_CONTEXT 考证成立——brief L14 断言 run.result 经 GET /api/runs/:id 可达，但 runs 表（001_init.sql）12 列无 result、RunStore.update() 白名单丢弃该字段、Run 接口/rowToRun 无映射；系 e89881c JSON→Postgres 迁移的存量回归（RunHistory.tsx:731 读 detailRun.result 的结果 tab 静默失效），plan 文本关于该数据通路的假设有误
Ruling: Task 12 采纳实施者方案 A——授权其扩大范围一并修后端（003_runs_result.sql 加 result JSONB + Run 接口/rowToRun/update 白名单补 result，约 20 行），约束：①独立 fix: 提交且先于 PptPanel 的 feat: 提交，审查包 BASE=a51aeea 两提交合一；②RunHistory 零改动（数据流复活系同列附带效果）；③迁移走 scripts/migrate.ts 幂等；④nodeResults 全量持久化与 pre-Postgres 行为一致可接受，体积问题终审不再议
Task 12: 提交 05d0e49（fix: runs.result 后端通路，仅 persistence）+ a2ba0a9（feat: PptPanel，仅前端）；测试 persistence 5/5、studio-api 43/43、studio-web 13/13、typecheck+build 全绿
Task 12: 审查 REJECTED（双裁决同根）——Important×1：buildRunId 声明后从未写入 run.id（PptPanel.tsx:285/776/1387），done 视图下载链接与 building 视图 runId 展示恒不渲染；修法 onCompleted 内 setView('done') 前补 setBuildRunId(run.id)。后端修复质量逐项核证为优（003 迁移风格/run.result 类型/update 白名单/列表端点无 payload 膨胀）
Task 12: fix round 1/5（Important #1 + 顺手 minor #2 精炼后清过期警示条 + #3 targetPages 钳位——同文件三处小修，BASE=a2ba0a9）
Task 12: minor (deferred): 413 文案按 body 10MB 表述、base64 膨胀后实际约 7.5MB（功能达标，文案可优化或路由调限）
Task 12: minor (deferred): pollRun 单次瞬时网络错误即终止 watch，无 N 次容错重试（与 RunHistory 既有行为一致，brief 未要求）
Task 12: minor (deferred): runs.ts 3 处 prettier 钩子无关行纯格式重排（实施者已披露，语义为空）
Task 12: 信息项: editedOutline 以「入口 state + normalizeOutline(deepClone)」替代 brief 字面 useMemo 深拷贝（报告偏差已披露，意图等价，终审确认）
Task 12: fix round 1 落地 0c59f2b（+7/-2 仅 PptPanel.tsx：setBuildRunId×2/警示清理/页数钳位）
Task 12: re-review ADDRESSED（四项逐核通过，无夹带）
Task 12: complete (commits a51aeea..0c59f2b 共 3 提交——05d0e49 后端通路/a2ba0a9 面板本体/0c59f2b 审查修复, review Approved 经 1 修复轮, re-review ADDRESSED 零新破损)
Task 13: 提交 aef352e（test: ppt-e2e.ts + README 追加；typecheck 绿；vitest 全绿 pptx-core 17/workflow-core 2/pptx-builder 5/collector 16/persistence 5）
Task 13: e2e 三模式实跑——无 key SKIP exit 0 / .env key 401 如实 FAIL exit 1 / mock LLM 端点三步全过（deck.pptx 80,117B 落 ArtifactStore 独立 unzip 核验）
Task 13: 环境事实: .env 唯一启用 DEEPSEEP_API_KEY 实测 401 invalid（KIMI/RIGHTCODE 已撤销）——真实推理链待有效 key 重跑；runId 澄清 executor 自生成 ppt-build-<ts> 与生产一致；README prettier 重排两无关表格（语义为零，预裁定允许）
Task 13: 会话偶发长文本输出损坏两处均自愈（/home/tutuos 残留文件已删、/tmp mock 重写校验；仓库文件逐行核验无损坏）
Task 13: 审查 Approved 双裁决零 Important（审查者独立实跑 SKIP/FAIL/mock 全过 + 严格 tsc 复验 + README 归一化比对语义为零）
Task 13: minor (deferred): sample.pptx 落仓库根未入 .gitignore（66KB 二进制有 git add -A 误提交风险；建议追一行，搭终审修复提交）
Task 13: minor (deferred): README:163 格式适配宿主编号列表（措辞逐字一致，审查者建议维持现状，仅备案）
Task 13: minor (deferred): ppt-e2e.ts:384,391 console.log 后 process.exit(1) 理论 stdout 截断竞态（建议 process.exitCode 自然退出，搭终审修复提交）
Task 13: complete (commit aef352e, review Approved 首审即过)
== 全部 13 任务 complete，进入最终全分支审查 ==

== 最终全分支审查完成（fable，报告落 final-review-report.md）==
终审结论: With fixes——Critical 0 / Important 3 / Minor 10；Ruling 13 条事实复核基本吻合（Ruling 8 标注 WorkflowNodeResult.artifacts 类型层面待确认，运行时透传无碍，不构成翻案）
Ruling: 终审报告的 13 处修复项与 HEAD 现状逐项对账后仅 10 项仍需修——HEAD 已越过终审范围（aef352e），用户以本人 git 身份在 SDD 之外追加 9 提交（a5527b8..0f0e823，含 collector lint/sample.pptx gitignore/工作流产物对齐/素材路径约束/文件名清洗/skill 空大纲防线+枚举钳位/告警去重/资产路径 themeId 注入+MIME 修复/工坊 UI-UX 优化），其中顺带修掉终审 4 项（T3② MIME、T3③ notes 全版式、T12② pollRun 三次容错、T11③ 之 /themes 文案）及预标注 T13①/T5②/T7①——这 9 提交未经任何审查，其 diff（aef352e..0f0e823，+315/-73）并入修复后限定复审一并覆盖
终审 triage 裁决表照录 final-review-report.md（留 issue 4 项：T2① 包级 tsconfig、T3④ 七版式全量单测、T6③ 扫描件提示、T9③ ArtifactStore 注入、T9① Content-Disposition 转义——共 5 项；其余不修/销项/终审修复）
终审建议（架构/质量/流程）记档不派工：ArtifactStore 注入、PptTemplateStore id 参数、accent 提取测试、e2e parse 闭环步骤、计划期预标注搭车 minor
== 最终修复 dispatch（10 项，BASE=0f0e823）==
终审修复: DONE 提交 8203364（9 文件 +95/-31，A-J 十项一次修完）；typecheck 0 + pptx-core 18/18 + collector 16/16 + pptx-builder 5/5 + studio-api 44/44（新增 presentation.xml 守卫与 DELETE 资产清理两用例）+ studio-web tsc/eslint 0；prettier 钩子 3 处无关重排版已精确回滚，diff 仅含 10 项
Ruling: H 项残留——/themes catch 仍 String(err)（brief 前提有误：先前对账时把 /templates 的「第二段 500 通用文案」注释误读为 /themes 已修；实施者如实上报并以 /templates 口径修了 DELETE 与 /uploads）——裁决补齐 /themes 同口径（T11③ 原目标即为三路由统一），resume 原实施者并入 8203364，避免复审后二次往返
信息项: J 项失败路径因 undici 空闲连接池可能晚数秒退出，退出码正确（可接受）；studio-api/scripts 不在根 tsconfig，实施者以临时 tsconfig 严格核验通过
终审修复 amend: /themes 补齐后提交重写为 a6968c4（信息原样保留；T11③ 三路由统一达成，ppt.ts 无 String(err) 直出）；studio-api 44/44 复绿
== 限定复审 dispatch（范围 aef352e..a6968c4 = 用户 9 提交 + 修复提交，sonnet）==
限定复审结果: 第一部分（a6968c4 修复）ADDRESSED 十项+amend 逐项吻合零夹带；第二部分（用户 9 提交）REJECTED——Critical 0 / Important 1 / Minor 3 / 备注 3，整体工程质量良好（7 项全过、2 项部分过），报告落 re-review-final.md
Ruling: Important 1（主题资产任意文件读取：plugin-runner 不带 themeId 时客户端 assetBasePath 透传 + 带 themeId 时 coverImagePath/backgroundPath ../ 逃逸 join，字节内嵌 deck.pptx 可取回 .env 伪造 JWT）必修——存量向量但在用户安全加固提交的直接射程内，按本分支标准 Important 阻断合并
Ruling: 搭车裁决——Minor 2（artifacts[].path 绝对路径泄入 run result，复审建议同修）修；Minor 3（themeId 无归属/格式校验）修（plugin-runner 同区域，格式钳制或归属校验由实施者按上下文可行性定夺并报告）；Minor 4（存量行 theme JSONB 带 assetBasePath）修读侧过滤（rowToTemplate 剥离，不做数据订正）；备注 1（gitignore 空行）不修纯格式
== 修复轮 2 dispatch（复审 Important 1 + 搭车 Minor 2/3/4，resume 原实施者）==
修复轮 2: DONE 提交 295213e（8 文件 +228/-19：闸 A resolveThemeForBuild 无条件剥离客户端 assetBasePath / 闸 B resolveConfinedAssetPath 目录闭合+纯色降级 / run result 全节点剥离 artifacts / themeId 白名单∪UUID 钳制 / rowToTemplate 读侧剥离）；typecheck 0 + pptx-core 20 + collector 16 + pptx-builder 5 + workflow-core 7 + persistence 6 + studio-api 44 全绿（新增 10 用例）
Ruling: 顾虑 1 接受——闸 B 顺带移除「无 assetBasePath 直读」分支属同一攻击链子向量（coverImagePath 携 cwd 相对/绝对路径直读），扩展正确非越界
Ruling: 顾虑 2 接受——归属校验需 userId 贯穿 WorkflowRunContext（WorkflowRunContext 不带 userId，非廉价可得），本轮格式钳制（白名单∪UUID）足够（UUID 实际不可猜）；userId 贯通留 issue 独立改造
Ruling: 顾虑 3 记账不修——PptPanel PptThemeData 过时注释（assetBasePath 已被读侧剥离失效）留 issue 与 userId 贯通一起清理；本轮禁止事项维持清单外零改动
== 安全向限定复审 dispatch（范围 a6968c4..295213e，sonnet）==
安全向复审: ADDRESSED——攻击链两子向量独立验证闭合（闸 A 全分支无条件剥离 + 唯一生产调用点核验；闸 B 逐攻击形态核验 + 正向回归证明 + 被移除直读分支无合法依赖）；Critical 0 / Important 0 / Minor 1 / 备注 3
Ruling: Minor 1（存量 run.result.artifacts[].path 读侧仍下发，与 Fix 4 不对称）留 issue 不修——写侧已闭合、存量仅本地开发 run、影响与原 Minor 2 同级（低），随下次触碰 persistence 顺带处理
Ruling: 备注 1-3 接受归档（/uploads 绝对路径收敛可选后续点；闸 B 词法校验符合范围界定、无用户可控建链入口；BUILTIN 常量硬编码 fail-closed 仅功能风险）
== 审查周期干净。归档报告入仓 → 删工作区 → finishing-a-development-branch ==
留 issue 汇总（合并后处理）: ①rowToRun 读侧剥离存量 artifacts[].path ②userId 贯穿 WorkflowRunContext 做模板归属校验+顺带清理 PptPanel PptThemeData 过时注释 ③/uploads 响应绝对路径收敛（可选）④pptx-core 包级 tsconfig ⑤七版式全量单测（v2 前）⑥扫描件专门提示 ⑦ArtifactStore 依赖注入 ⑧Content-Disposition filename 转义 ⑨accent 槽位提取测试+e2e parse 闭环步骤
