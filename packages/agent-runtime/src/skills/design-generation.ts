/**
 * Skill: design-generation
 *
 * Takes a mature RequirementDocument and generates a previewable frontend page
 * that can be directly viewed in a browser.
 */

import type { JsonObject } from '../../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../../skill-sdk/src';

export const designGenerationSkill: SkillDefinition = {
  name: 'design-generation',
  version: '0.1.0',
  description: '根据需求文档生成可预览的前端页面',
  inputSchema: { name: 'requirement-spec' },
  outputSchema: { name: 'generation-report' },
  defaultModel: {
    model: 'auto',
    temperature: 0.6,  // Required when thinking is disabled
    maxTokens: 8192,
    thinking: { type: 'disabled' },  // Disable reasoning to save tokens for HTML output
  },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const targetProfileId = ctx.targetProfile?.id ?? 'vue3-admin';
    const framework = ctx.targetProfile?.framework ?? 'vue3';
    const uiLibrary = (ctx.targetProfile as unknown as Record<string, unknown>)?.uiLibrary ?? 'Element Plus';

    return {
      system: `你是一个资深前端 UI 设计师和前端开发者。你的任务是根据需求文档生成一个可直接在浏览器中预览的前端页面。

## 目标

输出的不是概念图，也不是纯视觉稿，而是“可运行的静态前端预览页”。
这个预览页用于帮助产品、设计、研发快速确认页面结构、信息层级、核心组件和主要交互状态。

## 要求

1. 生成一个完整的 HTML 文件（自包含，所有 CSS 内联）
2. 使用 ${uiLibrary} 的 CDN 版本模拟真实页面风格
3. 页面应尽量接近真实后台/业务页面，而不是海报式设计图
4. 必须覆盖：
   - 整体布局（侧边栏 / 顶栏 / 内容区）
   - 当前需求涉及的主要页面区域
   - 表格、表单、筛选区、按钮、卡片、弹窗占位等核心组件
   - loading、empty、有数据三类关键状态中的至少两类
5. 如果需求包含多个页面，用单个 HTML 中的多个区块或标签页展示不同页面预览
6. 风格专业、现代、偏企业级产品，不要过度装饰

## 输出格式

{
  "pageName": "frontend-preview",
  "targetProfile": "${targetProfileId}",
  "generatedFiles": [
    {
      "path": "artifacts/frontend-preview.html",
      "kind": "page",
      "status": "generated",
      "content": "<!DOCTYPE html>..."
    }
  ],
  "patches": [
    {
      "target": "artifacts/frontend-preview.html",
      "action": "create",
      "summary": "可预览前端页面，包含主要界面结构与状态展示"
    }
  ],
  "notes": ["预览页说明1", "预览页说明2"]
}

关键：
- content 字段必须包含完整 HTML
- HTML 必须可直接在浏览器打开
- 使用内联样式，不依赖外部 CSS 文件（除了 CDN）
- 输出中文界面
- 不要输出图片链接、Markdown 或解释性长文，只输出符合格式的结果`,

      user: `需求文档:
${JSON.stringify(input, null, 2)}

目标框架: ${framework}
UI 库: ${uiLibrary}`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    return {
      pageName: String(raw.pageName ?? 'frontend-preview'),
      targetProfile: String(raw.targetProfile ?? 'vue3-admin'),
      generatedFiles: Array.isArray(raw.generatedFiles) ? raw.generatedFiles : [],
      patches: Array.isArray(raw.patches) ? raw.patches : [],
      notes: Array.isArray(raw.notes) ? raw.notes : [],
    };
  },
};
