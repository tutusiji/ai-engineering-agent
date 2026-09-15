/**
 * ppt-source-collector — PPT 素材归一化 plugin
 *
 * 将三路输入归一化为 ppt-source 合约（contracts/ppt-source.schema.json）：
 * - paste: 粘贴文本直通（Markdown 原样保留）
 * - file: 文档解析 — .docx 走 mammoth / .pdf 走 pdfjs-dist / .md·.txt utf-8 直读
 * - platform-project: 经 persistence RunStore 读取平台 run 的
 *   interactive_requirement → architecture_planning → page_planning 节点结果，
 *   拼接为 Markdown（无数据的节点跳过该节）
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { JsonObject, JsonValue } from '@ai-engineering-agent/shared-types';
import type { PluginContext, PluginDefinition, PluginResult } from '@ai-engineering-agent/plugin-sdk';
import { RunStore, type Run } from '@ai-engineering-agent/persistence';
import mammoth from 'mammoth';

/** 收集器输入 — sourceType 判别三路输入，其余字段按来源选用 */
export type CollectInput = {
  sourceType: 'paste' | 'file' | 'platform-project';
  text?: string;
  filePath?: string;
  projectRunId?: string;
};

/** 收集器依赖注入 — 默认解析器/获取器的替身，供单测注入 fake */
export interface CollectorDeps {
  parseDocx?: (b: Buffer) => Promise<string>;
  parsePdf?: (b: Buffer) => Promise<string>;
  fetchPlatformDoc?: (runId: string) => Promise<string>;
}

/** 收集结果 meta — 字数、告警与来源标识 */
export type CollectMeta = {
  wordCount: number;
  warnings: string[];
  fileName?: string;
  projectRunId?: string;
};

/** 收集结果 — 即 ppt-source 合约结构 */
export type CollectResult = {
  sourceType: string;
  markdown: string;
  meta: CollectMeta;
};

/** 素材过短阈值（字数） */
const MIN_SOURCE_WORDS = 100;

/** 素材过长阈值（字数） */
const MAX_SOURCE_WORDS = 20000;

/** utf-8 直读的纯文本扩展名（其余按二进制格式分发） */
const SUPPORTED_TEXT_EXTS = new Set(['.md', '.markdown', '.txt']);

/** 平台 run 中作为 PPT 素材的文档节点（按工作流产出顺序排列） */
const PLATFORM_DOC_SECTIONS: ReadonlyArray<{ nodeId: string; title: string }> = [
  { nodeId: 'interactive_requirement', title: '需求文档' },
  { nodeId: 'architecture_planning', title: '架构设计方案' },
  { nodeId: 'page_planning', title: '页面规划' },
];

/** CJK 统一表意文字字符类（含扩展 A 区），用于中英混排字数统计 */
const CJK_CHAR_CLASS = '\\u3400-\\u4dbf\\u4e00-\\u9fff';

/**
 * 统计素材字数 — 每个汉字计 1，连续非汉字片段计 1 词（中英混排可比）
 * @param text 归一化后的素材文本
 * @returns 字数
 */
function countWords(text: string): number {
  // 汉字逐字计数
  const cjkChars = text.match(new RegExp(`[${CJK_CHAR_CLASS}]`, 'g'))?.length ?? 0;
  // 去掉汉字后按空白切分，剩余片段（英文/数字/标点串）计词
  const tokens = text
    .replace(new RegExp(`[${CJK_CHAR_CLASS}]`, 'g'), ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
  return cjkChars + tokens.length;
}

/**
 * 默认 docx 解析器 — mammoth convertToHtml 转 HTML 标记文本
 * @param buffer docx 文件二进制
 * @returns 带结构标记的文本
 */
async function defaultParseDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml({ buffer });
  return value;
}

/**
 * 默认 PDF 解析器 — pdfjs-dist（legacy 构建）提取文本层
 *
 * 注：brief 原定的 pdf-parse 内嵌 pdf.js 1.10.100，实测在 Node ≤ 22 上对
 * 合法 PDF（含 ghostscript 产物）抛 'bad XRef entry'，而仓库 CI 固定 Node 22，
 * 故改用维护中的 pdfjs-dist；动态导入以延迟加载该重依赖。
 * @param buffer pdf 文件二进制
 * @returns 纯文本（按行拼接）
 */
async function defaultParsePdf(buffer: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // verbosity: 0 屏蔽标准字体缺省的非致命 warning
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    verbosity: 0,
  }).promise;
  const lines: string[] = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    // 同一 y 坐标的文本项按序拼接，y 变化即换行（与 pdf-parse 的提取行为一致）
    let line = '';
    let lastY: number | undefined;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== undefined && y !== lastY) {
        lines.push(line);
        line = '';
      }
      line += item.str;
      lastY = y;
    }
    if (line.length > 0) lines.push(line);
    page.cleanup();
  }
  await doc.destroy();
  return lines.join('\n');
}

/**
 * 单个节点结果渲染为 Markdown 片段 — 字符串直出，结构化结果以 JSON 代码块无损呈现
 * @param result 节点产出（persistence RunStage.result）
 * @returns Markdown 片段
 */
function renderStageResult(result: unknown): string {
  if (typeof result === 'string') return result;
  return `\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
}

/**
 * 将平台 run 的文档节点结果拼接为 Markdown — 无数据的节点跳过该节
 * @param run persistence RunStore 读出的 run 记录
 * @returns 拼接后的 Markdown（无任何文档节点时为空字符串）
 */
export function assemblePlatformDoc(run: Run): string {
  const sections: string[] = [];
  for (const { nodeId, title } of PLATFORM_DOC_SECTIONS) {
    const stage = run.stages.find((s) => s.id === nodeId);
    // 节点未产出结果（未执行/跳过/失败）时跳过该节
    if (!stage || stage.result === undefined || stage.result === null) continue;
    sections.push(`## ${title}\n\n${renderStageResult(stage.result)}`);
  }
  return sections.join('\n\n');
}

/**
 * 默认平台文档获取 — 经 persistence RunStore 读取 run 并拼接文档节点
 * @param runId 平台项目 run id
 * @returns 拼接后的 Markdown
 */
async function defaultFetchPlatformDoc(runId: string): Promise<string> {
  const run = await new RunStore().get(runId);
  if (!run) throw new Error(`平台项目 run 不存在: ${runId}`);
  return assemblePlatformDoc(run);
}

/**
 * file 来源读取 — 按扩展名分发到对应解析器
 * @param filePath 文档路径
 * @param deps 依赖注入（可替换默认解析器）
 * @returns 归一化后的文本
 */
async function readMarkdownFile(filePath: string, deps?: CollectorDeps): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  // 扩展名白名单校验（先于 IO，避免为不支持的格式读大文件）
  if (ext !== '.docx' && ext !== '.pdf' && !SUPPORTED_TEXT_EXTS.has(ext)) {
    throw new Error(`不支持的文档格式: ${ext || '(无扩展名)'}（支持 .md/.txt/.docx/.pdf）`);
  }
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch (err) {
    // 文件不存在时给出可读错误，其余 IO 错误原样抛出
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // 携带原始错误作为 cause，保留完整错误链
      throw new Error(`文档不存在: ${filePath}`, { cause: err });
    }
    throw err;
  }
  if (ext === '.docx') {
    const parseDocx = deps?.parseDocx ?? defaultParseDocx;
    return parseDocx(buffer);
  }
  if (ext === '.pdf') {
    const parsePdf = deps?.parsePdf ?? defaultParsePdf;
    return parsePdf(buffer);
  }
  return buffer.toString('utf8');
}

/**
 * 三路素材归一化入口 — paste / file / platform-project → ppt-source 结构
 * @param input 收集输入（sourceType 判别）
 * @param deps 可选依赖注入（缺省用 mammoth / pdf-parse / RunStore 实现）
 * @returns ppt-source 结构：sourceType + markdown + meta（字数/告警/来源标识）
 */
export async function collectSource(input: CollectInput, deps?: CollectorDeps): Promise<CollectResult> {
  // switch 全分支（含 default 抛错）必然赋值，无需初始化占位
  let markdown: string;
  let fileName: string | undefined;
  let projectRunId: string | undefined;

  switch (input.sourceType) {
    case 'paste':
      // 粘贴文本直通，Markdown 原样保留
      markdown = input.text ?? '';
      break;
    case 'file':
      if (!input.filePath) throw new Error('file 来源必须提供 filePath');
      markdown = await readMarkdownFile(input.filePath, deps);
      fileName = path.basename(input.filePath);
      break;
    case 'platform-project':
      if (!input.projectRunId) throw new Error('platform-project 来源必须提供 projectRunId');
      markdown = await (deps?.fetchPlatformDoc ?? defaultFetchPlatformDoc)(input.projectRunId);
      projectRunId = input.projectRunId;
      break;
    default:
      throw new Error(`不支持的素材来源: ${String(input.sourceType)}（支持 paste / file / platform-project）`);
  }

  // 字数统计与长度边界告警（过短/过长互斥）
  const wordCount = countWords(markdown);
  const warnings: string[] = [];
  if (wordCount < MIN_SOURCE_WORDS) warnings.push('素材过短，建议补充内容');
  if (wordCount > MAX_SOURCE_WORDS) warnings.push('素材过长，建议分段生成');

  const meta: CollectMeta = {
    wordCount,
    warnings,
    // 可选字段条件展开（缺省不产出键）
    ...(fileName !== undefined ? { fileName } : {}),
    ...(projectRunId !== undefined ? { projectRunId } : {}),
  };
  return { sourceType: input.sourceType, markdown, meta };
}

/** ppt-source-collector plugin 定义 — 三路素材归一化，输出 ppt-source 合约 */
export const pptSourceCollectorPlugin: PluginDefinition = {
  name: 'ppt-source-collector',
  version: '0.1.0',
  description: '三路素材归一化（粘贴 / 文档 / 平台项目）为 ppt-source 合约',
  outputSchema: { name: 'ppt-source' },
  sideEffect: 'none',
  async execute(ctx: PluginContext, input: JsonObject): Promise<PluginResult> {
    // 素材来源完全由 input 决定，ctx 仅满足 plugin 签名
    void ctx;
    // 工作流传入 { source: {...} } 时解包，直接传 CollectInput 时原样使用
    const raw: JsonValue | undefined = input.source;
    const collectInput = (raw ?? input) as unknown as CollectInput;
    const result = await collectSource(collectInput);
    // 可选字段条件展开（缺省不产出键），保证 output 满足 JsonObject（JsonValue 不含 undefined）
    const output: JsonObject = {
      sourceType: result.sourceType,
      markdown: result.markdown,
      meta: {
        wordCount: result.meta.wordCount,
        warnings: result.meta.warnings,
        ...(result.meta.fileName !== undefined ? { fileName: result.meta.fileName } : {}),
        ...(result.meta.projectRunId !== undefined ? { projectRunId: result.meta.projectRunId } : {}),
      },
    };
    return { ok: true, output };
  },
};
