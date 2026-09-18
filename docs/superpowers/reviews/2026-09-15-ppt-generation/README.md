# PPT 生成功能 — 终审与复审报告归档（2026-09-15 计划）

SDD 工作区删除前的审计存档。分支 worktree-ppt-generation，终审范围 3d5684e..aef352e（fable），复审两轮覆盖 aef352e..295213e。

- `final-review-report.md` — 最终全分支审查（fable，5 遍，With fixes：3 Important + triage 裁决表 + 13 条 Ruling 复核）
- `re-review-final.md` — 限定复审①：10 项修复 ADDRESSED + 用户 9 提交首次审查（发现 Important 任意文件读取，见其发现 1）
- `re-review-security.md` — 限定复审②（安全向）：修复 295213e 攻击链闭合独立验证，ADDRESSED
- `progress.md` — SDD ledger 全程（13 任务 + 修复轮 + 全部 Ruling）

## 留 issue 汇总（合并后处理）

1. rowToRun 读侧剥离存量 run.result.artifacts[].path（随下次触碰 persistence）
2. userId 贯穿 WorkflowRunContext 做模板归属校验（当前 UUID 钳制 fail-closed 足够）+ 顺带清理 PptPanel PptThemeData 过时注释
3. /uploads 响应绝对路径收敛（可选）
4. pptx-core 包级 tsconfig.json（加 build 流程时统一补）
5. 七版式全量自动化单测（v2 版式复刻前补全）
6. 扫描件 PDF 专门提示（需 OCR/启发式，v1 粘贴降级可接受）
7. plugin-runner ArtifactStore 依赖注入（配置化时统一）
8. Content-Disposition filename 引号转义（当前文件名固定 deck.pptx 不触发）
9. parseTemplate accent 槽位提取测试 + e2e 增加 parse 闭环步骤
