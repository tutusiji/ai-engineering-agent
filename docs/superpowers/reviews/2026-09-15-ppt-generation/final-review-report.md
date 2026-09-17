# PPT 生成功能最终全分支审查报告（fable）

**审查范围：** `3d5684e..aef352e`（20 commits，57 文件，+5096/-78）
**审阅遍数：** 5 遍（合约层+pptx-core / skill+plugin 层 / workflow-core+YAML+persistence / API+前端+e2e / 安全面专项）

## 结论

**With fixes**——Critical 0 / Important 3 / Minor 10。整体架构清晰、功能完整、测试覆盖到位、安全面可靠，13 条 Ruling 事实基本吻合。小范围低风险修复后即可合并。

## Important

1. **DELETE /api/ppt/templates/:id 不清理资产目录，产生孤儿目录**（ppt.ts DELETE 路由）——templateStore.delete 成功后应 rmSync artifactStore.getBaseDir()/templates/<id>（recursive+force）。id 来自 DB 行且已经 ownerId 校验，路径安全。
2. **/api/ppt/uploads 无 req.user 校验**——与 /templates 对齐加显式校验；v1 可只加校验不存 owner。
3. **buildPptx defineLayout 死三元**（build.ts width: theme.slideSize === '16:9' ? 10 : 10）——改 width: 10 + 注释「宽固定 10 英寸，4:3 仅调整高」。

## Minor

4. toDataUri MIME 硬编码 image/png（**已被用户提交 a4c11f0 修复**）
5. notes 仅 content-bullets/two-col 写入（**已被修复**：build.ts addNotes 已移出版式分支）
6. content-bullets 空 polishedBullets 渲染游离符号点（triage：不修）
7. parse.ts presentation.xml 非空断言无守卫
8. collector y 轴浮点严格相等判换行 → Math.abs(y - lastY) > 0.5
9. defaultParsePdf 无 try/finally，doc.destroy() 可能不执行
10. runs.ts BINARY_EXTS 每请求重建 → 提升模块作用域
11. pollRun 单次网络错误即终止（**已被用户提交 0f0e823 修复**：连续 3 次容错）
12. 413 文案按 10MB 表述、base64 后实际 ~7.5MB
13. plugin-runner 每节点 new ArtifactStore()（triage：留 issue）

## 缓议 minor triage 裁决表（照录）

| 条目 | 裁决 |
|------|------|
| T1① 合约测试负向断言 / T1② RED 段转述 | 不修 |
| T2① pptx-core 包级 tsconfig | 留 issue |
| T2② 预算表 Math.max 下限 | 不修 |
| T3① 死三元 / T3② MIME / T3③ notes | 终审修复 |
| T3④ 七版式全量单测 | 留 issue |
| T3⑤ 空 polishedBullets | 不修 |
| T4① presentation.xml 守卫 | 终审修复 |
| T4② 背景图类型校验 / T4③ master/layout 扫描 | 不修 |
| T5① 非法 density / T5③ audience 缺省 | 不修 |
| T5② polish pageType 枚举 | 不修（已修复，8ab8905） |
| T6① pdf-parse 字样 / T6⑤ 异常路径单测 | 不修 |
| T6② try/finally / T6④ y 轴 epsilon | 终审修复 |
| T6③ 扫描件提示 | 留 issue |
| T7① bulletCount=0 计 3 警告 | 不修（**已被 69bb191 按页去重修复**） |
| T7② workspaceRoot 死代码 / T7③ mkdtempSync 清理 | 不修 |
| T9① Content-Disposition 转义 | 留 issue |
| T9② BINARY_EXTS 提升 | 终审修复 |
| T9③ ArtifactStore 注入 | 留 issue |
| T9④ 存量英文 JSDoc | 不修（Ruling 11 豁免） |
| T10① 测试清理 happy path | 不修 |
| T11① DELETE 孤儿目录 / T11② 10MB 文案 | 终审修复 |
| T11③ /themes、DELETE、/uploads String(err) 直出 | 终审修复 |
| T12① 413 文案 / T12② pollRun 容错 | 终审修复（T12② 已被 0f0e823 修复） |
| T12③ prettier 重排 | 不修 |
| T12 信息项 editedOutline | 销项（意图等价） |
| T13① sample.pptx gitignore | 销项（已修复，6cbb654） |
| T13② README 措辞 | 不修 |
| T13③ exitCode | 终审修复 |

## Ruling 事实复核

13 条逐一核证基本吻合。Ruling 8 部分不符：plugin-runner 返回的 PluginResult 含 artifacts 字段而 WorkflowNodeResult 类型未确认包含——运行时透传无碍，不构成翻案，记档。

## 建议（记档不派工）

- 架构：WorkflowExecutor 注入共享 ArtifactStore；PptTemplateStore.create 放开 id 参数
- 质量：parseTemplate 增 accent 槽位提取测试；e2e 增加 parseTemplate(sample.pptx) 闭环步骤
- 流程：计划期预标注搭车 minor，减少终审 triage 工作量；终审前最后 sync 缓议清单
