/**
 * visual-regression-runner 真实执行器
 *
 * 使用 playwright-core + 系统 Chrome 对目标页面截图，与基线图片进行
 * pixelmatch 像素对比，输出 diff 图与相似度报告。
 *
 * 三种模式：
 * - baseline：首次运行（无基线），自动生成基线截图
 * - compare：存在基线，执行像素对比并输出 diff 图
 * - degraded：浏览器不可用时降级为诊断报告
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { JsonObject, JsonValue, ValidationIssue, ValidationReport } from '@ai-engineering-agent/shared-types';
import { createValidationReport } from '@ai-engineering-agent/validation-core';
import { buildVisualRegressionValidation, type VisualRegressionRunnerInput } from './index.js';

/** 待截图页面定义 */
export interface VisualTargetPage {
  /** 页面标识（用作文件名，如 home、login） */
  name: string;
  /** 页面 URL */
  url: string;
  /** 视口尺寸（默认 1280x720） */
  viewport?: { width: number; height: number };
}

/** 真实执行输入 */
export interface VisualRegressionExecuteInput extends VisualRegressionRunnerInput {
  /** 待截图页面列表 */
  pages?: VisualTargetPage[];
  /** 基线目录（默认 <targetProject>/artifacts/visual-baseline） */
  baselineDir?: string;
  /** 截图输出目录（默认 <targetProject>/artifacts/screenshots） */
  outputDir?: string;
  /** 像素对比阈值（0-1，默认 0.1） */
  threshold?: number;
  /** 单页截图超时（默认 30s） */
  timeoutMs?: number;
  /** 系统 Chrome 可执行路径（默认自动探测 /usr/bin/google-chrome） */
  chromePath?: string;
}

/** 单页对比结果 */
export interface VisualDiffResult {
  name: string;
  url: string;
  status: 'passed' | 'failed' | 'baseline-created' | 'error';
  /** 差异像素占比（0-1），error 时为 null */
  diffRatio: number | null;
  baselinePath?: string;
  screenshotPath?: string;
  diffPath?: string;
  error?: string;
}

/** 真实执行结果 */
export interface VisualRegressionExecuteResult {
  /** 诊断状态 */
  runnerStatus: string;
  /** 人类可读摘要 */
  summary: string;
  /** 是否真正执行了截图对比 */
  executed: boolean;
  /** 是否为基线生成模式（首次运行） */
  baselineMode: boolean;
  results: VisualDiffResult[];
}

/** 自动探测系统 Chrome 路径 */
async function detectChromePath(): Promise<string | null> {
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium.chrome',
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // 继续探测下一个
    }
  }
  return null;
}

/** 启动无头浏览器（优先系统 Chrome） */
async function launchBrowser(chromePath?: string): Promise<Browser> {
  const executablePath = chromePath ?? (await detectChromePath()) ?? undefined;
  return chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

/** 页面截图并保存 PNG */
async function capturePage(page: Page, url: string, savePath: string, timeoutMs: number): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
  await page.screenshot({ path: savePath, fullPage: false });
}

/** 对比两张 PNG 图片，返回 diff 结果 */
async function compareImages(
  baselinePath: string,
  screenshotPath: string,
  diffPath: string,
  threshold: number,
): Promise<{ diffRatio: number; matched: boolean }> {
  const [baselineBuf, screenshotBuf] = await Promise.all([
    fs.readFile(baselinePath),
    fs.readFile(screenshotPath),
  ]);

  const baseline = PNG.sync.read(baselineBuf);
  const screenshot = PNG.sync.read(screenshotBuf);

  // 尺寸不一致时以基线尺寸裁剪对比（等比截断）
  const width = Math.min(baseline.width, screenshot.width);
  const height = Math.min(baseline.height, screenshot.height);
  const diff = new PNG({ width, height });

  const diffPixels = pixelmatch(
    baseline.data,
    screenshot.data,
    diff.data,
    width,
    height,
    { threshold },
  );

  await fs.writeFile(diffPath, PNG.sync.write(diff));

  const totalPixels = width * height;
  const diffRatio = totalPixels > 0 ? diffPixels / totalPixels : 1;
  return { diffRatio, matched: diffRatio < 0.05 };
}

/**
 * 真实执行视觉回归（截图 + 像素对比）
 *
 * 流程：
 * 1. 先跑诊断，确认支持视觉回归且目标项目存在
 * 2. 无基线目录 → 生成基线（baseline 模式）
 * 3. 有基线 → 逐页截图对比，输出 diff 图
 * 4. 浏览器不可用 → 降级为诊断报告
 */
export async function executeVisualRegression(
  input: VisualRegressionExecuteInput,
): Promise<JsonObject> {
  const diagnostic = await buildVisualRegressionValidation(input);
  const runnerStatus = String(diagnostic.runnerStatus ?? 'unknown');

  // Profile 不支持视觉回归：直接返回诊断结果
  if (runnerStatus === 'unsupported') {
    return toJsonObject({
      ...diagnostic,
      executed: false,
      summary: String(diagnostic.summary ?? '当前 target profile 不支持视觉回归'),
    });
  }

  // 没有提供待截图页面：降级为诊断结果
  const pages = input.pages;
  if (!pages || pages.length === 0) {
    return toJsonObject({
      ...diagnostic,
      executed: false,
      summary: `${String(diagnostic.summary ?? '')}（未提供待截图页面，跳过真实执行）`,
    });
  }

  const targetProject = input.targetProject!;
  const baselineDir = input.baselineDir ?? path.join(targetProject, 'artifacts', 'visual-baseline');
  const outputDir = input.outputDir ?? path.join(targetProject, 'artifacts', 'screenshots');
  const threshold = input.threshold ?? 0.1;
  const timeoutMs = input.timeoutMs ?? 30_000;

  // 浏览器探测失败：降级
  const chromePath = input.chromePath ?? (await detectChromePath());
  if (!chromePath) {
    return toJsonObject({
      ...diagnostic,
      executed: false,
      summary: '未检测到系统 Chrome，无法执行真实截图（已降级为诊断报告）',
    });
  }

  await fs.mkdir(baselineDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  const hasBaseline = await fs
    .readdir(baselineDir)
    .then((files) => files.length > 0)
    .catch(() => false);

  const results: VisualDiffResult[] = [];
  const issues: ValidationIssue[] = [];

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser(chromePath);

    for (const pageDef of pages) {
      const screenshotPath = path.join(outputDir, `${pageDef.name}.png`);
      const baselinePath = path.join(baselineDir, `${pageDef.name}.png`);
      const diffPath = path.join(outputDir, `${pageDef.name}.diff.png`);

      try {
        const context = await browser.newContext({
          viewport: pageDef.viewport ?? { width: 1280, height: 720 },
        });
        const page = await context.newPage();
        await capturePage(page, pageDef.url, screenshotPath, timeoutMs);
        await context.close();

        // 基线模式：写入基线
        if (!hasBaseline) {
          await fs.copyFile(screenshotPath, baselinePath);
          results.push({
            name: pageDef.name,
            url: pageDef.url,
            status: 'baseline-created',
            diffRatio: null,
            baselinePath,
            screenshotPath,
          });
          continue;
        }

        // 基线文件不存在：视为该页首次建档
        const baselineExists = await fs
          .access(baselinePath)
          .then(() => true)
          .catch(() => false);
        if (!baselineExists) {
          await fs.copyFile(screenshotPath, baselinePath);
          results.push({
            name: pageDef.name,
            url: pageDef.url,
            status: 'baseline-created',
            diffRatio: null,
            baselinePath,
            screenshotPath,
          });
          continue;
        }

        // 对比模式
        const { diffRatio, matched } = await compareImages(baselinePath, screenshotPath, diffPath, threshold);
        results.push({
          name: pageDef.name,
          url: pageDef.url,
          status: matched ? 'passed' : 'failed',
          diffRatio,
          baselinePath,
          screenshotPath,
          diffPath,
        });

        if (!matched) {
          issues.push({
            category: 'visual',
            severity: 'high',
            message: `页面 ${pageDef.name} 视觉回归未通过（差异 ${(diffRatio * 100).toFixed(2)}%）`,
            file: diffPath,
            suggestion: '检查该页面最近的 UI 变更，或确认基线是否需要更新',
          });
        }
      } catch (err) {
        results.push({
          name: pageDef.name,
          url: pageDef.url,
          status: 'error',
          diffRatio: null,
          error: err instanceof Error ? err.message : String(err),
        });
        issues.push({
          category: 'visual',
          severity: 'medium',
          message: `页面 ${pageDef.name} 截图失败: ${err instanceof Error ? err.message : String(err)}`,
          file: pageDef.url,
        });
      }
    }
  } catch (err) {
    return toJsonObject({
      ...diagnostic,
      executed: false,
      summary: `浏览器启动失败，已降级为诊断报告: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    await browser?.close().catch(() => undefined);
  }

  const report: ValidationReport = createValidationReport(issues);
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const baselineCount = results.filter((r) => r.status === 'baseline-created').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  return toJsonObject({
    ...report,
    runnerStatus: report.passed ? 'passed' : 'failed',
    executed: true,
    baselineMode: !hasBaseline,
    summary: hasBaseline
      ? `视觉回归执行完成：${results.length - baselineCount} 页对比，${failedCount} 页未通过，${errorCount} 页失败`
      : `首次运行：已为 ${baselineCount} 个页面生成基线截图`,
    chromePath,
    baselineDir,
    outputDir,
    threshold,
    results: toJsonValue(results),
    details: {
      baselineMode: !hasBaseline,
      totalPages: pages.length,
      failedCount,
      errorCount,
    },
  });
}

function toJsonObject<T>(value: T): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function toJsonValue<T>(value: T): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
