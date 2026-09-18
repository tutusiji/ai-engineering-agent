import type {
  ArtifactRef,
  JsonObject,
  JsonValue,
  SchemaRef,
  TargetProfileRef,
  ValidationReport,
} from '../../shared-types/src';

export interface PluginContext {
  runId: string;
  nodeId: string;
  workspaceRoot: string;
  sandboxRoot?: string;
  targetProject?: string;
  targetProfile?: TargetProfileRef;
  env: Record<string, string | undefined>;
  logger: PluginLogger;
  artifacts: PluginArtifactStore;
}

export interface PluginLogger {
  info(message: string, extra?: Record<string, JsonValue>): void;
  warn(message: string, extra?: Record<string, JsonValue>): void;
  error(message: string, extra?: Record<string, JsonValue>): void;
}

export interface PluginArtifactStore {
  publish(artifact: Omit<ArtifactRef, 'id'>): Promise<ArtifactRef>;
  /** 保存二进制产物（Buffer），返回落盘绝对路径；由宿主注入，插件按需使用。 */
  saveBinary?(runId: string, filePath: string, content: Buffer): string;
}

// Plugin 负责确定性动作，例如扫描仓库、生成文件、执行规则检查。
export interface PluginDefinition<TInput extends JsonObject = JsonObject, TOutput extends JsonObject = JsonObject> {
  name: string;
  version: string;
  description: string;
  inputSchema?: SchemaRef;
  outputSchema?: SchemaRef;
  sideEffect?: 'none' | 'repo-write' | 'external-call';
  execute(ctx: PluginContext, input: TInput): Promise<PluginResult<TOutput>>;
}

export interface PluginResult<TOutput extends JsonObject = JsonObject> {
  ok: boolean;
  output?: TOutput;
  validation?: ValidationReport;
  artifacts?: ArtifactRef[];
  logs?: string[];
}

export interface PluginGroupDefinition {
  name: string;
  version: string;
  plugins: string[];
}
