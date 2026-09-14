# PPT 生成功能设计（from-content-to-ppt）

- 日期: 2026-09-14
- 状态: 已评审通过（方案 A：平台原生流水线）
- 范围: v1（主题提取式）

## 1. 背景与目标

为 ai-engineering-agent 平台新增 PPT 生成能力：用户选择内置主题或上传自己的 .pptx 模板，输入最近的工作内容（粘贴文本 / 上传文档 / 平台已生成项目），系统自动生成 PPT 文本大纲（可审批精炼）、美化文字内容，并按主题或模板风格输出原生 .pptx 文件。

设计原则：不新造基础设施，完全复用平台既有范式 —— Skill（受约束推理）、workflow-core DAG（编排/审批闸门/重试）、contracts（结构化中间产物）、plugins（确定性执行）、persistence（JSONB 文档存储）、studio-web 面板（交互范式）。

## 2. 需求决策记录

| 决策点   | 结论                                                                    |
| -------- | ----------------------------------------------------------------------- |
| 最终产物 | 原生 .pptx 文件（PowerPoint/WPS 可编辑）                                |
| 模板深度 | v1 主题提取（提取配色/字体/背景/logo，AI 重新排版）；v2 版式级复刻      |
| 输入来源 | 粘贴文本/Markdown + 上传文档（docx/pdf/md）+ 平台生成项目提取，三源并存 |
| 美化范围 | v1 文字层（大纲提炼 + 短句改写 + 逐页分配 + 金句）；图表/配图留待后续   |

## 3. 总体架构与数据流

新增工作流 `workflows/from-content-to-ppt.yaml`，与"想法→全栈应用"平行，跑在现有 workflow-core 上：

```
[用户] 选主题或传模板 → 输入素材（粘贴 / 文档 / 平台项目）→ 生成
        │
        ▼
① ppt-source-collector   (plugin·非AI)  素材归一化 → ppt-source
    粘贴文本直用 / docx·pdf·md 解析为 Markdown / 读平台 document 提取
        ▼
② ppt_outline_planning   (skill·AI)     大纲提炼 → ppt-outline
        ▼
★★ 审批闸门：大纲确认（可对话精炼，复用 approvalGates + refinement 模式）
        ▼
③ ppt_content_polish     (skill·AI)     文字美化 → ppt-content
        ▼
④ pptx_builder           (plugin·确定性) ppt-content + 主题/模板 → .pptx artifact
```

关键数据流决策：

1. **主题/模板信息在①就注入**：AI 写大纲时即知道每种 pageType 的字数预算（由 layoutDensity 决定），从根上避免"大纲很好但模板页放不下"。
2. **主题与模板同构**：预设主题是手写 ppt-theme JSON；上传模板经解析提取出同构 JSON。生成端只有一条代码路径。
3. **模板"上传即解析"**：.pptx 上传时立即解析入库（主题 JSON + 资产），生成时读解析结果——上传一次可反复生成；模板解析不进 DAG。
4. **二进制产物**：.pptx 经 `ArtifactRef{kind:'pptx', path}` 落盘到 run 目录，DB 只存元数据（页数/主题/大小）。

## 4. 合约设计（contracts/ 新增 4 个 JSON Schema）

### 4.1 ppt-source（素材归一化产物）

| 字段              | 类型                                  | 说明                                       |
| ----------------- | ------------------------------------- | ------------------------------------------ |
| sourceType        | enum: paste / file / platform-project | 输入来源                                   |
| markdown          | string                                | 归一化后的 Markdown 素材                   |
| meta.fileName     | string?                               | 上传文件名（file 来源时）                  |
| meta.projectRunId | string?                               | 平台项目 run id（platform-project 来源时） |
| meta.wordCount    | number                                | 字数（用于过短/过长告警）                  |

### 4.2 ppt-outline（大纲中间产物，闸门审批对象）

| 字段              | 类型                                                                             | 说明                   |
| ----------------- | -------------------------------------------------------------------------------- | ---------------------- |
| deckTitle         | string                                                                           | 演示文稿标题           |
| subtitle          | string?                                                                          | 副标题                 |
| audience          | string                                                                           | 受众描述               |
| totalPages        | number                                                                           | 总页数                 |
| slides[]          | array                                                                            | 页面序列               |
| slides[].pageNo   | number                                                                           | 页码（1 起）           |
| slides[].pageType | enum: cover / toc / section / content-bullets / content-two-col / quote / ending | 页面类型               |
| slides[].title    | string                                                                           | 页标题                 |
| slides[].bullets  | string[]                                                                         | 要点（content 类页面） |
| slides[].notes    | string?                                                                          | 演讲备注               |

### 4.3 ppt-theme（主题定义，预设与模板提取同构）

| 字段          | 类型                                | 说明                                                                |
| ------------- | ----------------------------------- | ------------------------------------------------------------------- |
| name          | string                              | 主题名                                                              |
| mode          | enum: preset / extracted            | 来源：内置预设 / 模板提取                                           |
| colors        | object                              | primary / secondary / background / surface / text / accent          |
| fonts         | object                              | title / body（字体族名，带回退栈）                                  |
| assets        | object?                             | logoPath / backgroundPath / coverImagePath（相对 run/模板目录路径） |
| slideSize     | enum: '16:9' / '4:3'                | 画幅比例（预设主题显式指定；模板提取自 presentation.xml）           |
| layoutDensity | enum: compact / standard / spacious | 版面密度，决定字数预算                                              |

### 4.4 ppt-content（美化后最终文案）

在 ppt-outline 基础上，每页增加：

| 字段            | 说明                                                       |
| --------------- | ---------------------------------------------------------- |
| polishedTitle   | 短句化页标题（≤12 字，动词开头优先）                       |
| polishedBullets | 短句化要点（符合字数预算）                                 |
| hookLine        | 金句/数字强调（每页一条）                                  |
| fitting         | 逐页字数预算比对结果（超预算记 warning，驱动 retryTarget） |

## 5. Skill 设计（agent-runtime 新增 2 个）

### 5.1 ppt-outline-planning（大纲规划）

- inputSchema: ppt-source（内嵌素材）+ ppt-theme + preferences（targetPages / audience / occasion）
- outputSchema: ppt-outline
- buildPrompt 核心约束（中文 JSON 输出范式，对齐现有 skill）：
  - 金字塔原理叙事：结论先行，cover→toc→section→content→ending 序列
  - 按 layoutDensity 给出每页字数预算表（与 pptx-core 共用同一张表），分配内容不得超预算
  - 受众适配：向上汇报突出结论与数据；团队分享突出过程与细节
  - 忠实素材：只重组不臆造，素材中没有的数字不得编造
- normalize: slides 数组校验、pageNo 重排、pageType 枚举兜底、页数收敛到偏好区间
- defaultModel: temperature 0.3

### 5.2 ppt-content-polish（文字美化）

- inputSchema: 审批后的 ppt-outline + ppt-theme
- outputSchema: ppt-content
- buildPrompt 核心约束：
  - 标题短句化（≤12 字，动词开头）；bullets 名词短语优先、去虚词
  - 每页提炼一条 hookLine（金句或关键数字）
  - 生成口语化演讲备注（notes）
  - 数字/专有名词保真：与大纲逐字比对，不得改动数值
- normalize: 输出 fitting（逐页预算比对），超预算记 warning → 工作流 retryTarget: outline_planning 自动重试
- defaultModel: temperature 0.4

## 6. 库与插件设计（1 库 + 2 插件）

### 6.1 packages/pptx-core（纯函数库，无 PluginContext 依赖）

- `parseTemplate(filePath)` → ppt-theme：
  - JSZip 解包 + fast-xml-parser 解析 `ppt/theme/theme1.xml`（clrScheme 配色 / fontScheme 字体）
  - 统计各页实际用色，取使用频次定主次色
  - 从 `ppt/media/` 提取 logo/背景图（按引用频次 + 尺寸判断）
  - 读取 presentation.xml 的 slide size（16:9 / 4:3）
- `buildPptx(content, theme)` → Buffer：
  - pptxgenjs 生成，内置 7 种 pageType 版式渲染器（cover / toc / section / content-bullets / content-two-col / quote / ending）
  - 每种版式按字数预算排版，自动缩字号/减行距防溢出
- 字数预算表：`pageType × layoutDensity → { titleMax, bulletCount, bulletChars }`，skill prompt 与 buildPptx 共用（单一事实来源）

### 6.2 plugins/ppt-source-collector（sideEffect: none）

三路输入归一化：

- paste：文本直通（Markdown 保留）
- file：mammoth（docx）/ pdf-parse（pdf）/ 直读（md）转 Markdown
- platform-project：读 persistence 文档库中该 run 的 architecture-design / page-plan / requirement 文档，拼接为 Markdown

### 6.3 plugins/pptx-builder（sideEffect: repo-write）

- 调 `pptx-core.buildPptx`，产物写 run 目录
- 经 `ctx.artifacts.publish({ kind:'pptx', path })` 注册 artifact

> 模板上传解析不进 DAG：上传路由直接调 `pptx-core.parseTemplate`。

## 7. 工作流定义（workflows/from-content-to-ppt.yaml）

```yaml
id: from-content-to-ppt
name: From Content To PPT
version: 0.1.0
description: 从工作内容素材生成美化 PPT（素材归一化 → 大纲 → 审批 → 美化 → 构建）

input:
  fields:
    - { name: source, type: object, required: true } # paste|file|platform-project
    - { name: themeRef, type: object, required: false } # 预设id（可复制微调）|模板id
    - { name: preferences, type: object, required: false } # 页数/受众/场合

nodes:
  - { id: source_collect, type: plugin, name: 素材归一化, plugin: ppt-source-collector, outputSchema: ppt-source }
  - {
      id: outline_planning,
      type: agent,
      name: 大纲规划,
      skill: ppt-outline-planning,
      dependsOn: [source_collect],
      outputSchema: ppt-outline,
    }
  - {
      id: content_polish,
      type: agent,
      name: 文字美化,
      skill: ppt-content-polish,
      dependsOn: [outline_planning],
      outputSchema: ppt-content,
      retryTarget: outline_planning,
      maxRetries: 2,
    }
  - {
      id: pptx_build,
      type: plugin,
      name: PPTX 构建,
      plugin: pptx-builder,
      dependsOn: [content_polish],
      outputSchema: generation-report,
    }

output:
  primaryFrom: pptx_build

approvalGates:
  - afterStage: outline_planning
    name: 大纲审批
    required: true
    description: 确认大纲后再进入美化与构建
```

主题解析时机：`themeRef` 在 API 层解析为完整 ppt-theme JSON 再作为工作流输入（预设主题读库、支持复制后微调颜色/字体实现定制；模板读解析结果）——DAG 保持 4 节点。

对话精炼：大纲闸门暂停时用户输入反馈，复用现有 architecture-refinement 交互模式重跑 `outline_planning`（mode: 'ppt-outline-refinement'）。

## 8. API 设计（apps/studio-api/src/routes/ppt.ts）

| 方法   | 路径                        | 说明                                                                   |
| ------ | --------------------------- | ---------------------------------------------------------------------- |
| GET    | /api/ppt/themes             | 预设主题 + 当前用户模板列表（含色板预览数据）                          |
| POST   | /api/ppt/templates          | 上传 .pptx 模板（multipart）；立即调 parseTemplate，失败当场报错不入库 |
| DELETE | /api/ppt/templates/:id      | 删除用户模板（仅本人）                                                 |
| POST   | /api/ppt/generate           | 解析 themeRef → 组装工作流输入 → 启动 from-content-to-ppt run          |
| POST   | /api/ppt/runs/:runId/refine | 大纲精炼反馈（走 chat 通道）                                           |
| GET    | /api/runs/:runId/artifacts  | 扩展现有 artifacts 路由支持 kind:'pptx' 下载                           |

鉴权复用现有 session/userId 机制；模板与产物按 ownerId 隔离。

## 9. 前端设计（studio-web 新增 PptPanel.tsx）

- 入口：Sidebar 新增「PPT 工坊」；交互范式对齐 ArchitecturePanel
- 三步式流程：
  1. 主题选择：内置主题卡片（色板预览，可复制后微调颜色/字体定制风格）/ 上传 .pptx 模板
  2. 素材输入：tab 切换（粘贴 / 上传文档 / 选平台项目 run）
  3. 生成：进度展示（复用 MetricsProgress 模式）
- 大纲审批视图：每页 title/bullets 页内可直接编辑（微调不重生成）+ 对话框反馈精炼（重跑闸门）
- 完成态：下载 .pptx 按钮 + 全文预览

## 10. 持久化设计

- persistence 新增 `ppt_templates` 存储（JSONB：id / ownerId / name / source: builtin|uploaded / theme / assets 路径 / createdAt）
- 内置 3 套预设主题以种子数据入库：商务深蓝 / 科技暗黑 / 简约浅色（手写 ppt-theme JSON）
- 产物复用现有 artifact 存储（ArtifactRef path 指向 run 目录文件）

## 11. 错误处理

| 故障点                               | 处理                                                |
| ------------------------------------ | --------------------------------------------------- |
| 模板非 OOXML / 加密 pptx             | 上传时立即报错（"仅支持未加密的 .pptx"），不入库    |
| 素材过短（<100 字）/ 过长（>2 万字） | collector 输出 warning，前端提示补充或分段          |
| 扫描版 PDF 无文本层                  | 降级提示改用粘贴                                    |
| skill 输出不合 schema                | 现有 validation-core 校验 + 工作流 retryTarget 重试 |
| 内容溢出版面                         | fitting 校验前置拦截 + buildPptx 自动缩字号兜底     |
| pptxgenjs 生成异常                   | run 标记 failed，错误写 generation-report           |

## 12. 测试策略

- pptx-core 单测：fixture pptx 解析断言（配色/字体/资产提取）；buildPptx 产物用 JSZip 解包断言 XML 结构；字数预算表正确性
- skill normalize 单测：畸形输出（缺字段/错枚举/超页）兜底
- collector 单测：三路输入归一化 + 边界（空输入/超长输入）
- workflow 集成：现有 mock-runner 跑通全 DAG，含闸门暂停/恢复/精炼重跑
- 真实产物验收：一次性脚本生成样例 pptx，人工用 WPS/PowerPoint 打开校验（不入 CI）

## 13. 分期路线

- **v1（本设计范围）**：主题提取 + 3 套内置主题（支持复制微调定制）+ 三源输入 + 大纲审批 + 文字美化 + pptxgenjs 生成
- **v1.5**：页内编辑增强、AI 生成主题（自然语言描述 → ppt-theme）、自动图表（pptxgenjs 原生 chart 识别数据并可视化）、更多预设主题
- **v2 版式级复刻**：parseTemplate 升级为提取每类 pageType 骨架页（文本框位置/样式）；buildPptx 增加"克隆填充"渲染路径（克隆模板页 XML 并替换文本 run，保留版式）；模板规范性检测，不规范自动降级回主题提取

## 14. 与平台集成点汇总

| 平台设施                                        | 本功能用法                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| skill 体系（SkillDefinition）                   | 新增 2 个 skill                                                                         |
| workflow-core（DAG/审批闸门/retry/plugin 节点） | 新增 1 条工作流，大纲审批走闸门                                                         |
| contracts（JSON Schema）                        | 新增 4 个合约                                                                           |
| plugins（确定性执行）                           | 新增 2 个插件 + 1 个核心库                                                              |
| persistence（JSONB/artifact）                   | 模板表 + pptx artifact 扩展                                                             |
| studio-web（面板范式）                          | PptPanel + Sidebar 入口                                                                 |
| 代码生成流程协同                                | 平台项目提取复用已生成的架构/需求/页面规划文档，形成"生成应用 → 一键出交付汇报 PPT"闭环 |
