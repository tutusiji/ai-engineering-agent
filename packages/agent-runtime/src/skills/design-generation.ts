/**
 * Skill: design-generation
 *
 * Takes a mature RequirementDocument and generates HTML design mockups
 * that can be directly viewed in a browser.
 */

import type { JsonObject } from '../../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../../skill-sdk/src';

export const designGenerationSkill: SkillDefinition = {
  name: 'design-generation',
  version: '0.1.0',
  description: '根据需求文档生成 HTML 设计稿',
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
      system: `你是一个资深前端 UI 设计师和开发者。你的任务是根据需求文档生成可直接在浏览器中预览的 HTML 设计稿。

## 要求

1. 生成一个完整的 HTML 文件（自包含，所有 CSS 内联）
2. 使用 ${uiLibrary} 的 CDN 版本模拟 UI 组件风格
3. 设计稿要包含：
   - 整体布局（侧边栏 + 顶栏 + 内容区）
   - 所有页面的主要区域
   - 表格、表单、按钮等核心组件
   - 基本的交互状态（loading、empty、有数据）
4. 用不同区块展示不同页面的预览
5. 配色和风格要专业、现代

## 输出格式

{
  "pageName": "design-mockup",
  "targetProfile": "${targetProfileId}",
  "generatedFiles": [
    {
      "path": "artifacts/design-mockup.html",
      "kind": "page",
      "status": "generated",
      "content": "<!DOCTYPE html>..."
    }
  ],
  "patches": [
    {
      "target": "artifacts/design-mockup.html",
      "action": "create",
      "summary": "HTML 设计稿，包含所有页面的视觉预览"
    }
  ],
  "notes": ["设计稿说明1", "设计稿说明2"]
}

关键：
- content 字段必须包含完整的 HTML 代码
- HTML 必须是自包含的，可以直接在浏览器打开
- 使用内联样式，不依赖外部 CSS 文件（除了 CDN）
- 中文界面`,

      user: `需求文档:
${JSON.stringify(input, null, 2)}

目标框架: ${framework}
UI 库: ${uiLibrary}`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    return {
      pageName: String(raw.pageName ?? 'design-mockup'),
      targetProfile: String(raw.targetProfile ?? 'vue3-admin'),
      generatedFiles: Array.isArray(raw.generatedFiles) ? raw.generatedFiles : [],
      patches: Array.isArray(raw.patches) ? raw.patches : [],
      notes: Array.isArray(raw.notes) ? raw.notes : [],
    };
  },
};
