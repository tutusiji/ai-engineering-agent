/**
 * Skill: interactive-requirement
 *
 * Multi-turn conversational requirement gathering.
 * The AI actively asks clarifying questions, and the user can
 * iterate/correct until the requirements are mature enough.
 *
 * Two modes:
 *   1. Ask mode — AI asks questions to fill gaps
 *   2. Refine mode — AI refines existing requirements based on user feedback
 */

import type { JsonObject } from '../../../shared-types/src';
import type { SkillContext, SkillDefinition, SkillPrompt } from '../../../skill-sdk/src';

export interface RequirementDocument {
  /** 功能名称 */
  featureName: string;
  /** 业务背景和目标 */
  businessGoal: string;
  /** 用户角色 */
  userRoles: Array<{ name: string; description: string; permissions: string[] }>;
  /** 选择的 UI 组件库 */
  uiLibrary: {
    id: string;
    name: string;
    npmPackage: string;
    componentMapping: Record<string, string>;
    styling: string[];
  } | null;
  /** 页面列表 */
  pages: Array<{
    name: string;
    goal: string;
    pageType: 'list' | 'form' | 'detail' | 'dashboard' | 'modal' | 'drawer' | 'tab' | 'wizard';
    sections: string[];
    actions: string[];
    fields: Array<{ name: string; type: string; required: boolean; description: string }>;
    interactions: string[];
  }>;
  /** 数据实体 */
  entities: Array<{
    name: string;
    fields: Array<{ name: string; type: string; required: boolean; description: string }>;
  }>;
  /** 业务规则 */
  businessRules: string[];
  /** 边界 case */
  edgeCases: string[];
  /** 非功能需求 */
  nonFunctional: string[];
  /** 阶段拆分 */
  phases: Array<{ id: string; name: string; pages: string[]; priority: string }>;
  /** 需求完整度 0-100 */
  completeness: number;
  /** AI 提出的待确认问题 */
  openQuestions: string[];
  /** 建议下一步 */
  suggestedNextStep: 'continue-gathering' | 'review-document' | 'generate-design' | 'start-coding';
}

export const interactiveRequirementSkill: SkillDefinition = {
  name: 'interactive-requirement',
  version: '0.1.0',
  description: '交互式需求对话 — AI 主动追问，用户反复修改，逐步完善需求文档',
  inputSchema: { name: 'requirement-chat-input' },
  outputSchema: { name: 'requirement-spec' },
  defaultModel: {
    model: 'auto',
    temperature: 0.3,
  },

  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const userMessage = String(input.userMessage ?? input.userPrompt ?? '');
    const conversationHistory = Array.isArray(input.conversationHistory)
      ? (input.conversationHistory as Array<{ role: string; content: string }>)
      : [];
    const existingDoc = input.existingDocument as JsonObject | undefined;
    const mode = String(input.mode ?? 'gather'); // gather | refine | score

    // Compress history: strip JSON from assistant messages to save tokens
    // The existing document is sent separately, so we don't need JSON in history
    const compressMessage = (m: { role: string; content: string }): string => {
      if (m.role === 'assistant') {
        // Remove JSON code blocks from assistant messages
        let text = m.content.replace(/```[\s\S]*?```/g, '').trim();
        // Also remove raw JSON blocks (starts with { and ends with })
        text = text.replace(/\n?\{[\s\S]*"featureName"[\s\S]*\}/g, '').trim();
        if (text.length < 20) {
          // If only JSON was there, summarize
          const compMatch = m.content.match(/"completeness"\s*:\s*(\d+)/);
          const comp = compMatch ? compMatch[1] : '?';
          return `[assistant]: (已更新需求文档，completeness=${comp}%)`;
        }
        return `[assistant]: ${text}`;
      }
      return `[${m.role}]: ${m.content}`;
    };
    
    const historyText = conversationHistory.length > 0
      ? conversationHistory.map(compressMessage).join('\n')
      : '（首次对话）';

    // Use plain text summary instead of JSON to avoid triggering JSON output
    const existingDocText = existingDoc
      ? `\n当前需求进展：${summarizeDocPlain(existingDoc)}`
      : '';

    const modeInstructions = getModeInstructions(mode);

    return {
      system: `你是一个资深前端产品分析师和需求架构师。你的任务是通过对话帮助用户梳理出完整、可执行的前端需求。

${modeInstructions}

## 你的职责

你是一个对话式需求分析师。你的唯一职责是通过对话帮助用户梳理需求。

**你不需要输出 JSON 文档。** 文档更新由系统自动处理，你只需要专注于对话。

### 对话原则

1. **确认回答** — 用户回答后，简要确认（"好的，已了解"），然后继续下一个问题
2. **深入追问** — 对模糊的回答要追问细节（"你说的xxx具体是指？"）
3. **覆盖全面** — 按以下维度逐步梳理，不要遗漏：
   - 功能范围和业务目标
   - 用户角色和权限
   - 页面结构（每个页面的功能、字段、交互）
   - 数据实体和字段定义
   - 业务规则和约束
   - 边界情况和异常处理
   - UI 组件库偏好
   - 技术栈偏好
4. **自然对话** — 像产品经理和用户聊天一样，不要像问卷调查
5. **适时总结** — 每讨论完一个维度，总结一下已确认的内容
6. **简洁高效** — 每次回复控制在 150 字以内

### 回复格式

直接回复文字即可，不要输出 JSON、代码块或结构化数据。
例如：
- "好的，React + SSR 确认。接下来想了解一下页面结构，你设想有哪些页面？"
- "明白了，用户分三种角色。关于权限这块，管理员能做哪些操作？"`,

      user: `对话历史:
${historyText}
${existingDocText}

用户最新消息:
${userMessage}`,
    };
  },

  async normalize(raw: JsonObject): Promise<JsonObject> {
    const doc: JsonObject = {
      featureName: String(raw.featureName ?? '未命名功能'),
      businessGoal: String(raw.businessGoal ?? ''),
      userRoles: Array.isArray(raw.userRoles) ? raw.userRoles : [],
      uiLibrary: raw.uiLibrary && typeof raw.uiLibrary === 'object'
        ? (() => {
            const lib = raw.uiLibrary as Record<string, unknown>;
            return {
              id: String(lib.id ?? ''),
              name: String(lib.name ?? ''),
              npmPackage: String(lib.npmPackage ?? ''),
              componentMapping: (typeof lib.componentMapping === 'object' && lib.componentMapping !== null
                ? lib.componentMapping
                : {}) as Record<string, string>,
              styling: Array.isArray(lib.styling) ? lib.styling : ['css'],
            };
          })()
        : null,
      pages: Array.isArray(raw.pages) ? raw.pages.map(normalizePage) : [],
      entities: Array.isArray(raw.entities) ? raw.entities : [],
      businessRules: Array.isArray(raw.businessRules) ? raw.businessRules : [],
      edgeCases: Array.isArray(raw.edgeCases) ? raw.edgeCases : [],
      nonFunctional: Array.isArray(raw.nonFunctional) ? raw.nonFunctional : [],
      phases: Array.isArray(raw.phases) ? raw.phases : [],
      completeness: typeof raw.completeness === 'number' ? Math.min(100, Math.max(0, raw.completeness)) : 0,
      openQuestions: Array.isArray(raw.openQuestions) ? raw.openQuestions : [],
      suggestedNextStep: String(raw.suggestedNextStep ?? 'continue-gathering'),
    };

    return doc;
  },
};

function normalizePage(page: unknown): JsonObject {
  const p = page as Record<string, unknown>;
  return {
    name: String(p.name ?? '未命名页面'),
    goal: String(p.goal ?? ''),
    pageType: String(p.pageType ?? 'list'),
    sections: Array.isArray(p.sections) ? p.sections : [],
    actions: Array.isArray(p.actions) ? p.actions : [],
    fields: Array.isArray(p.fields) ? p.fields : [],
    interactions: Array.isArray(p.interactions) ? p.interactions : [],
  };
}

function summarizeDocPlain(doc: Record<string, unknown>): string {
  const parts: string[] = [];
  if (doc.featureName) parts.push(`功能「${doc.featureName}」`);
  if (doc.businessGoal) parts.push(`目标: ${String(doc.businessGoal).slice(0, 80)}`);
  if (doc.uiLibrary) {
    const lib = typeof doc.uiLibrary === 'object' ? (doc.uiLibrary as Record<string, unknown>).name : doc.uiLibrary;
    parts.push(`UI库: ${lib}`);
  }
  const pages = Array.isArray(doc.pages) ? doc.pages : [];
  if (pages.length > 0) parts.push(`已确认${pages.length}个页面`);
  const entities = Array.isArray(doc.entities) ? doc.entities : [];
  if (entities.length > 0) parts.push(`${entities.length}个实体`);
  const rules = Array.isArray(doc.businessRules) ? doc.businessRules : [];
  if (rules.length > 0) parts.push(`${rules.length}条规则`);
  const questions = Array.isArray(doc.openQuestions) ? doc.openQuestions : [];
  if (questions.length > 0) parts.push(`还有${questions.length}个待确认问题`);
  if (doc.completeness !== undefined) parts.push(`完整度${doc.completeness}%`);
  return parts.join('，') || '尚未开始收集';
}

function getModeInstructions(mode: string): string {
  switch (mode) {
    case 'gather':
      return `## 模式：需求收集

你在帮助用户从零开始梳理需求。当前阶段：
- 如果是首次对话，先理解用户的核心意图，然后有针对性地追问
- 如果已有部分需求，检查缺失维度，主动提问补齐
- 每次回复提出 1-2 个有价值的追问（不要超过 2 个）
- 逐步收集需求信息，每次确认后继续下一个维度

### 重要：何时停止追问

根据当前需求文档的完整度（completeness）决定行为：
- **< 50%**：继续追问核心缺失项（功能范围、页面结构、用户角色）
- **50%-70%**：只追问最关键的 1 个缺失项，其余放到待确认问题
- **>= 70%**：**停止追问！** 改为总结已确认的需求，明确告知用户"需求已基本完整"，建议进入下一步
- **>= 80%**：直接建议生成设计稿
- **>= 95%**：建议直接生成代码

当你判断 completeness >= 70% 时，你的回复应该是：
"好的，需求已基本梳理完成！目前已确认 [总结]。你可以查看右侧面板的需求文档。建议下一步：生成设计稿。"
不要再问新的问题。`;

    case 'refine':
      return `## 模式：需求细化

用户在对已有需求进行修改和确认：
- 根据用户的反馈修改对应部分
- 保持用户未提及的部分不变
- 如果修改引入了新的不确定性，放进 openQuestions
- 确认修改后继续讨论下一个待确认项`;

    case 'score':
      return `## 模式：需求评估

对当前需求文档进行完整度评分：
- 逐项检查每个维度
- 给出具体的分数和理由
- 指出最薄弱的环节
- 给出明确的改进建议
- 如果 completeness >= 80，suggestedNextStep 设为 "generate-design"
- 如果 completeness >= 95，suggestedNextStep 设为 "start-coding"`;

    default:
      return '';
  }
}