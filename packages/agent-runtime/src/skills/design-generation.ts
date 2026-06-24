/**
 * Skill: design-generation
 *
 * Takes a mature RequirementDocument and generates an interactive,
 * clickable preview page with mock data that simulates the real application.
 * Users can click through tabs, open modals, fill forms, and see state changes.
 */

import type { JsonObject } from '../../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../../skill-sdk/src';

export const designGenerationSkill: SkillDefinition = {
  name: 'design-generation',
  version: '0.2.0',
  description: '根据需求文档生成可交互点击的全栈应用预览页（含 mock 数据、标签切换、弹窗、表单交互）',
  inputSchema: { name: 'requirement-spec' },
  outputSchema: { name: 'generation-report' },
  defaultModel: {
    model: 'auto',
    temperature: 0.6,
    maxTokens: 32768,  // Increased for interactive HTML with mock data + JS
    thinking: { type: 'disabled' },
  },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const archTech = (ctx.architectureDesign as JsonObject | undefined)?.techStack as JsonObject | undefined;
    const archFrontend = archTech?.frontend as JsonObject | undefined;
    const targetProfileId = ctx.targetProfile?.id ?? 'architecture-driven';
    const framework = String(archFrontend?.framework ?? ctx.targetProfile?.framework ?? 'vue3');
    const uiLibrary = String(archFrontend?.uiLibrary ?? ctx.targetProfile?.uiLibrary ?? 'Element Plus');
    const pages: JsonObject[] = Array.isArray(input.pages) ? (input.pages as JsonObject[]) : [];
    const pageCount = pages.length;
    const pageNames = pages.map((p: JsonObject) => String(p.name ?? '')).join('、');

    return {
      system: `你是一个资深全栈 UI 设计师。你的任务是根据需求文档生成一个**可交互操作的高保真预览页面**。

## 核心目标

这不是静态截图，而是一个**可点击、可交互的模拟应用**。用户可以：
- 点击侧边栏菜单切换不同"页面"视图
- 在列表页点击"新增"打开弹窗表单
- 填写表单字段并"提交"（模拟成功/失败）
- 点击表格行的"编辑"/"删除"触发对应交互
- 看到 loading → 数据加载 → empty 状态的完整流程
- 切换 tab 页查看不同内容区域

## 技术要求

### 基础框架
1. 单个自包含 HTML 文件，所有 CSS/JS 内联
2. 使用 ${uiLibrary} 的 CDN 版本（unpkg CDN）渲染真实组件风格
3. 使用原生 JavaScript 实现所有交互逻辑（不需要框架）

### Mock 数据（必须）
4. 在 JS 中定义至少 10-15 条 mock 数据记录作为"后端返回的数据"
5. Mock 数据要真实——包含中文姓名、邮箱、时间戳、状态枚举等
6. 所有"API 调用"用 setTimeout 模拟 300-800ms 延迟

### 交互功能（至少实现以下 6 项）
7. **侧边栏导航** — 点击菜单项切换主内容区视图（列表页/表单页/详情页）
8. **列表操作** — 表格显示 mock 数据，支持搜索过滤（实时过滤）
9. **新增弹窗** — 点击按钮打开 Modal/Drawer，包含完整表单
10. **表单验证** — 必填项校验、格式校验，提交按钮防重复点击
11. **删除确认** — 点击删除弹出确认框，确认后从列表中移除
12. **状态切换** — 列表页展示 loading → 数据 → empty 三种状态的切换能力

### 页面结构
13. 整体布局：左侧可折叠侧边栏 + 顶部面包屑 + 主内容区
14. 如果需求有多个页面（${pageCount} 个：${pageNames}），每个页面对应一个侧边栏菜单项
15. 为每个页面准备对应的视图区域，通过 display:none/block 切换

### 视觉要求
16. 专业的企业级风格，中文界面
17. 表格、按钮、输入框使用 ${uiLibrary} 的 CDN 组件样式
18. 包含面包屑、分页器、标签、徽章等细节组件

## 输出格式

{
  "pageName": "interactive-preview",
  "targetProfile": "${targetProfileId}",
  "generatedFiles": [
    {
      "path": "artifacts/interactive-preview.html",
      "kind": "page",
      "status": "generated",
      "content": "<!DOCTYPE html>\\n<html>\\n..."
    }
  ],
  "patches": [
    {
      "target": "artifacts/interactive-preview.html",
      "action": "create",
      "summary": "可交互操作的高保真预览页 — 包含侧边栏导航、mock 数据列表、新增/编辑弹窗、删除确认、搜索过滤、状态切换"
    }
  ],
  "notes": [
    "实现的功能列表",
    "未覆盖的边界情况说明"
  ]
}

## 关键约束

- content 字段中的 HTML 必须是完整可运行的，直接在浏览器打开即可使用
- CDN 样式仅用于视觉，交互逻辑全部用原生 JS
- 每个用户可见的功能都要有对应的交互实现
- 不要使用图片链接，用 CSS 图标或文字替代
- 只输出 JSON，不要其他文字`,

      user: `需求文档:
${JSON.stringify(input, null, 2)}

目标框架: ${framework}
UI 库: ${uiLibrary}

请生成一个可交互操作的高保真预览页，让用户可以在浏览器中实际操作体验。`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    return {
      pageName: String(raw.pageName ?? 'interactive-preview'),
      targetProfile: String(raw.targetProfile ?? 'architecture-driven'),
      generatedFiles: Array.isArray(raw.generatedFiles) ? raw.generatedFiles : [],
      patches: Array.isArray(raw.patches) ? raw.patches : [],
      notes: Array.isArray(raw.notes) ? raw.notes : [],
    };
  },
};
