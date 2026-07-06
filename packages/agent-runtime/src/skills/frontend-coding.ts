/**
 * Skill: frontend-coding-core
 *
 * Takes a UIContract + page plan and produces an ImplementationPlan
 * with file paths, component dependencies, and route changes.
 */

import type { JsonObject } from '@ai-engineering-agent/shared-types';
import type { SkillContext, SkillDefinition, SkillPrompt } from '@ai-engineering-agent/skill-sdk';

export const frontendCodingSkill: SkillDefinition = {
  name: 'frontend-coding-core',
  version: '0.1.0',
  description: '根据 UIContract 和页面规划生成实现方案',
  inputSchema: { name: 'ui-contract' },
  outputSchema: { name: 'implementation-plan' },
  defaultModel: {
    model: 'auto',
    temperature: 0.2,
  },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const archTech = (ctx.architectureDesign as JsonObject | undefined)?.techStack as JsonObject | undefined;
    const archFrontend = archTech?.frontend as JsonObject | undefined;
    const targetProfileId = ctx.targetProfile?.id ?? 'architecture-driven';
    const framework = String(archFrontend?.framework ?? ctx.targetProfile?.framework ?? 'vue3');

    return {
      system: `你是一个全栈实现方案专家。根据 UIContract 和页面规划，输出详细的实现方案（包含前端、后端 API、数据库模型的文件清单和路由变更）。

当前目标: ${targetProfileId} (${framework})

你必须输出一个合法的 JSON 对象，格式如下：
{
  "pageName": "页面名称",
  "targetProfile": "${targetProfileId}",
  "files": [
    {
      "path": "相对于项目根目录的文件路径",
      "kind": "view | page | component | composable | hook | api | type | style | test"
    }
  ],
  "routeChanges": ["需要修改的路由配置描述"],
  "componentDependencies": ["依赖的通用组件名称"]
}

文件路径规范：
- Vue3: src/views/{page-name}/index.vue, src/views/{page-name}/use-{page-name}-page.ts, src/api/{page-name}.ts
- React: src/pages/{page-name}/index.tsx, src/pages/{page-name}/hooks/use-{page-name}-page.ts, src/pages/{page-name}/service.ts
- 小程序: miniprogram/pages/{page-name}/index.ts, .wxml, .wxss

要求：
- 每个页面至少包含：页面文件、逻辑层（composable/hook）、API 封层、测试文件
- 如果页面有子组件，列出子组件文件
- 路径中的 page-name 要用 kebab-case
- routeChanges 要说明具体的路由配置修改
- componentDependencies 要列出需要引入的项目内通用组件
- 只输出 JSON，不要有其他文字`,

      user: `输入数据:
${JSON.stringify(input, null, 2)}`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    const files = Array.isArray(raw.files)
      ? raw.files.map((f: unknown) => {
          const file = f as Record<string, unknown>;
          return {
            path: String(file.path ?? ''),
            kind: String(file.kind ?? 'page'),
          };
        })
      : [];

    return {
      pageName: String(raw.pageName ?? '未命名页面'),
      targetProfile: String(raw.targetProfile ?? 'architecture-driven'),
      files,
      routeChanges: Array.isArray(raw.routeChanges) ? raw.routeChanges : [],
      componentDependencies: Array.isArray(raw.componentDependencies)
        ? raw.componentDependencies
        : [],
    };
  },
};
