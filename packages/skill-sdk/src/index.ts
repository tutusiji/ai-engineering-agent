import type {
  ArtifactRef,
  JsonObject,
  JsonValue,
  SchemaRef,
  TargetProfileRef,
  ValidationReport,
} from '@ai-engineering-agent/shared-types';

export interface SkillContext {
  runId: string;
  nodeId: string;
  targetProject?: string;
  targetProfile?: TargetProfileRef;
  /** 解析后的完整 target profile（包含 backend/database/deployment 等扩展字段） */
  resolvedTargetProfile?: JsonObject;
  /** 架构设计方案输出 — 当 workflow 中 architecture-planning 节点已执行时填充 */
  architectureDesign?: JsonObject;
  schemas: SkillSchemaResolver;
  policies: SkillPolicyResolver;
  artifacts: ArtifactRef[];
  logger: SkillLogger;
}

export interface SkillLogger {
  info(message: string, extra?: Record<string, JsonValue>): void;
  warn(message: string, extra?: Record<string, JsonValue>): void;
  error(message: string, extra?: Record<string, JsonValue>): void;
}

export interface SkillSchemaResolver {
  get(ref: SchemaRef): Promise<JsonObject | undefined>;
}

export interface SkillPolicyResolver {
  get(name: string): Promise<JsonObject | undefined>;
  /** 列出可用的 target profile ID 列表（可选 — 仅 profile 模式需要） */
  listTargetProfiles?(): Promise<string[]>;
}

export interface SkillModelConfig {
  provider?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  thinking?: { type: 'enabled' | 'disabled' };
}

// Skill 负责受约束的推理与结构化输出，不直接承担不透明的副作用。
export interface SkillDefinition<TInput extends JsonObject = JsonObject, TOutput extends JsonObject = JsonObject> {
  name: string;
  version: string;
  description: string;
  inputSchema?: SchemaRef;
  outputSchema?: SchemaRef;
  defaultModel: SkillModelConfig;
  buildPrompt(ctx: SkillContext, input: TInput): Promise<SkillPrompt>;
  normalize?(raw: JsonObject): Promise<TOutput>;
}

export interface SkillPrompt {
  system: string;
  user: string;
  attachments?: Array<{
    kind: 'text' | 'artifact';
    content: string;
  }>;
}

export interface SkillResult<TOutput extends JsonObject = JsonObject> {
  ok: boolean;
  output?: TOutput;
  validation?: ValidationReport;
  artifacts?: ArtifactRef[];
}
