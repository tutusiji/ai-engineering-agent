/**
 * Skill: ui-library-selection
 *
 * Helps users choose a UI component library based on their
 * framework preference and project requirements.
 */

import type { JsonObject } from '../../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../../skill-sdk/src';
import { getCompatibleLibraries, getLibrarySummary } from '../ui-catalog';

export const uiLibrarySelectionSkill: SkillDefinition = {
  name: 'ui-library-selection',
  version: '0.1.0',
  description: '根据框架和需求推荐 UI 组件库',
  defaultModel: { model: 'auto', temperature: 0.2 },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const archTech = (ctx.architectureDesign as JsonObject | undefined)?.techStack as JsonObject | undefined;
    const archFrontend = archTech?.frontend as JsonObject | undefined;
    const framework = String(input.framework ?? archFrontend?.framework ?? ctx.targetProfile?.framework ?? 'vue3');
    const userPreference = String(input.userPreference ?? '');
    const projectType = String(input.projectType ?? '管理后台');

    const compatible = getCompatibleLibraries(framework);
    const catalogText = compatible.map(getLibrarySummary).join('\n');

    return {
      system: `你是一个前端技术选型专家。根据用户的框架偏好和项目类型，推荐最合适的 UI 组件库。

可用的 UI 组件库 (${framework}):
${catalogText}

你必须输出一个合法的 JSON 对象：
{
  "selectedLibrary": "库的 id (如 element-plus)",
  "libraryName": "库的显示名称 (如 Element Plus)",
  "npmPackage": "npm 包名",
  "reasons": ["选择理由1", "选择理由2"],
  "alternatives": [
    { "id": "备选库id", "name": "备选库名", "reason": "为什么是备选" }
  ],
  "styling": ["推荐的样式方案"],
  "componentMapping": {
    "button": "组件名",
    "form": "组件名",
    "table": "组件名",
    "dialog": "组件名",
    "message": "组件名",
    "drawer": "组件名",
    "pagination": "组件名",
    "tabs": "组件名",
    "datepicker": "组件名"
  },
  "notes": ["使用建议1", "使用建议2"]
}

选择原则：
- 如果用户明确指定了库，直接选择并给出理由
- 管理后台首选 Element Plus (Vue) 或 Ant Design (React)
- 注重设计感的项目推荐 Arco Design 或 HeroUI
- 需要高度定制推荐 Naive UI (Vue) 或 HeroUI (React)
- componentMapping 要用实际的组件名，不要用通用名
- 只输出 JSON`,

      user: `框架: ${framework}
项目类型: ${projectType}
${userPreference ? `用户偏好: ${userPreference}` : ''}

请选择最合适的 UI 组件库。`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    return {
      selectedLibrary: String(raw.selectedLibrary ?? 'element-plus'),
      libraryName: String(raw.libraryName ?? 'Element Plus'),
      npmPackage: String(raw.npmPackage ?? ''),
      reasons: Array.isArray(raw.reasons) ? raw.reasons : [],
      alternatives: Array.isArray(raw.alternatives) ? raw.alternatives : [],
      styling: Array.isArray(raw.styling) ? raw.styling : ['css'],
      componentMapping: typeof raw.componentMapping === 'object' && raw.componentMapping !== null
        ? raw.componentMapping as JsonObject
        : {},
      notes: Array.isArray(raw.notes) ? raw.notes : [],
    };
  },
};
