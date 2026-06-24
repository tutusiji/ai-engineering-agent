/**
 * Skill: code-generation
 *
 * Takes a mature RequirementDocument + phase and generates actual code files.
 * This is the final step — from requirements to real source code.
 */

import type { JsonObject } from '../../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../../skill-sdk/src';

export const codeGenerationSkill: SkillDefinition = {
  name: 'code-generation',
  version: '0.1.0',
  description: '根据需求文档和阶段生成实际代码文件',
  inputSchema: { name: 'requirement-spec' },
  outputSchema: { name: 'generation-report' },
  defaultModel: {
    model: 'auto',
    temperature: 0.15,
    maxTokens: 16384,
  },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const archTech = (ctx.architectureDesign as JsonObject | undefined)?.techStack as JsonObject | undefined;
    const archFrontend = archTech?.frontend as JsonObject | undefined;
    const targetProfileId = ctx.targetProfile?.id ?? 'architecture-driven';
    const framework = String(archFrontend?.framework ?? ctx.targetProfile?.framework ?? 'vue3');
    const uiLib = input.uiLibrary as Record<string, unknown> | null | undefined;
    const uiLibraryName = uiLib?.name ?? archFrontend?.uiLibrary ?? ctx.targetProfile?.uiLibrary ?? 'Element Plus';
    const componentMapping = uiLib?.componentMapping as Record<string, string> ?? {};
    const componentMapText = Object.keys(componentMapping).length > 0
      ? Object.entries(componentMapping).map(([k, v]) => `${k}: ${v}`).join(', ')
      : '使用默认组件';
    const phaseId = String(input.phaseId ?? 'P1');
    const pages = Array.isArray(input.pages) ? input.pages : [];

    return {
      system: `你是一个资深全栈工程师。你的任务是根据需求文档为指定阶段（${phaseId}）生成可运行的全栈代码文件（包括前端页面、后端 API、数据库模型等）。

## 技术栈

- 框架: ${framework}
- UI 库: ${uiLibraryName}
- 组件映射: ${componentMapText}
- 目标 profile: ${targetProfileId}

## 输出格式

{
  "pageName": "阶段${phaseId}代码",
  "targetProfile": "${targetProfileId}",
  "generatedFiles": [
    {
      "path": "src/xxx/index.vue",
      "kind": "view",
      "status": "generated",
      "content": "<template>...</template>..."
    }
  ],
  "patches": [],
  "notes": ["代码说明"]
}

## 代码质量要求

1. 每个文件必须是完整可运行的代码，不是骨架或占位符
2. 包含完整的 template/script/style 三部分
3. 必须实现需求文档中定义的所有交互规则：
   - 列表加载必须有 loading/empty/error 状态
   - 查询输入必须有 debounce (300ms)
   - 删除等危险操作必须有二次确认弹窗
   - 表单提交时按钮必须禁用防止重复提交
4. API 调用封装在独立的 service 文件中
5. 页面逻辑封装在 composable/hook 中
6. 使用 TypeScript，类型定义要完整
7. 代码风格要专业、现代

## 文件组织

### 前端
- 页面: src/views/{page-name}/index.vue
- 逻辑: src/views/{page-name}/use-{page-name}-page.ts
- API 调用: src/api/{page-name}.ts
- 类型: src/types/{page-name}.ts
- 组件: src/views/{page-name}/components/{ComponentName}.vue
- 路由: src/router/modules/{page-name}.ts

### 后端
- 控制器: api/src/modules/{entity}/controller.ts
- 服务: api/src/modules/{entity}/service.ts
- 模块: api/src/modules/{entity}/module.ts
- DTO: api/src/modules/{entity}/dto.ts
- 数据模型: api/prisma/schema.prisma

### 部署
- Dockerfile.api, Dockerfile.web
- docker-compose.yml
- deploy/nginx/default.conf`,

      user: `请为阶段 ${phaseId} 生成代码。

需求文档:
${JSON.stringify(input, null, 2)}

请只生成当前阶段涉及的页面代码。每个文件的 content 字段必须包含完整的代码内容。`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    return {
      pageName: String(raw.pageName ?? '未命名'),
      targetProfile: String(raw.targetProfile ?? 'architecture-driven'),
      generatedFiles: Array.isArray(raw.generatedFiles)
        ? raw.generatedFiles.map((f: unknown) => {
            const file = f as Record<string, unknown>;
            return {
              path: String(file.path ?? ''),
              kind: String(file.kind ?? 'page'),
              status: String(file.status ?? 'generated'),
              content: String(file.content ?? ''),
            };
          })
        : [],
      patches: Array.isArray(raw.patches) ? raw.patches : [],
      notes: Array.isArray(raw.notes) ? raw.notes : [],
    };
  },
};
