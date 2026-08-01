/**
 * playwright-runner 真实执行器
 *
 * 在目标仓库具备 Playwright 条件时，真实运行 `npx playwright test`，
 * 解析 JSON 报告并输出统一验证结果与执行日志产物。
 * 执行条件不满足时自动降级为诊断报告（不阻断工作流）。
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { JsonObject, JsonValue, ValidationIssue, ValidationReport } from '@ai-engineering-agent/shared-types';
import { createValidationReport } from '@ai-engineering-agent/validation-core';
import { buildPlaywrightValidation, type PlaywrightRunnerInput } from './index.js';

/** 真实执行输入 */
export interface PlaywrightExecuteInput extends PlaywrightRunnerInput {
  /** 自定义测试命令（默认 `npx playwright test --reporter=json`） */
  testCommand?: string;
  /** 执行超时（默认 120s） */
  timeoutMs?: number;
  /** 产物输出目录（日志文件写入位置） */
  outputDir?: string;
}

/** 单个失败用例信息 */
export interface PlaywrightFailure {
  title: string;
  file: string;
  error: string;
}

/** 真实执行结果 */
export interface PlaywrightExecuteResult {
  /** 诊断状态：ready / incomplete / not-configured / unsupported / failed */
  runnerStatus: string;
  /** 人类可读摘要 */
  summary: string;
  /** 是否真正执行了测试命令 */
  executed: boolean;
  /** 执行命令 */
  command?: string;
  /** 进程退出码 */
  exitCode?: number;
  /** 执行耗时（ms） */
  durationMs?: number;
  /** 测试统计 */
  stats?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  /** 失败用例列表 */
  failures?: PlaywrightFailure[];
  /** 日志文件路径（写入 outputDir 时存在） */
  logFile?: string;
  /** stdout 预览（截断 4000 字符） */
  stdoutPreview?: string;
  /** stderr 预览（截断 4000 字符） */
  stderrPreview?: string;
}

/** 解析 Playwright JSON 报告中的失败用例 */
function parseFailures(report: JsonObject): PlaywrightFailure[] {
  const failures: PlaywrightFailure[] = [];
  const suites = report.suites;
  if (!Array.isArray(suites)) return failures;

  const walk = (nodes: JsonValue[]): void => {
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const n = node as JsonObject;
      const specs = n.specs;
      if (Array.isArray(specs)) {
        for (const spec of specs) {
          const s = spec as JsonObject;
          const tests = s.tests;
          if (!Array.isArray(tests)) continue;
          for (const t of tests) {
            const test = t as JsonObject;
            const results = test.results;
            if (!Array.isArray(results)) continue;
            for (const r of results) {
              const res = r as JsonObject;
              if (res.status === 'failed' || res.status === 'timedOut') {
                const errObj = res.error as JsonObject | undefined;
                const errMsg = typeof res.error === 'string'
                  ? res.error
                  : String(errObj?.message ?? '未知错误');
                failures.push({
                  title: String(test.title ?? s.title ?? '未知用例'),
                  file: String(test.file ?? ''),
                  error: errMsg.slice(0, 500),
                });
              }
            }
          }
        }
      }
      const childSuites = n.suites;
      if (Array.isArray(childSuites)) walk(childSuites as JsonValue[]);
    }
  };

  walk(suites as JsonValue[]);
  return failures;
}

/** 运行真实 Playwright 测试命令，返回 stdout/stderr 与退出码 */
interface PlaywrightCommandOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  spawnError?: string;
}

async function runPlaywrightCommand(
  targetProject: string,
  command: string,
  timeoutMs: number,
): Promise<PlaywrightCommandOutput> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: targetProject,
      shell: true,
      env: { ...process.env, CI: '1' },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: null, timedOut, spawnError: err.message });
    });
  });
}

/**
 * 真实执行 Playwright 冒烟测试
 *
 * 流程：
 * 1. 先跑诊断，确认仓库具备执行条件（ready）
 * 2. 在 targetProject 下运行测试命令，捕获输出
 * 3. 解析 JSON 报告，输出统计与失败详情
 * 4. 若执行失败或环境异常，降级为诊断报告并说明原因
 */
export async function executePlaywrightValidation(
  input: PlaywrightExecuteInput,
): Promise<JsonObject> {
  const diagnostic = await buildPlaywrightValidation(input);
  const runnerStatus = String(diagnostic.runnerStatus ?? 'unknown');

  // 不满足执行条件：直接返回诊断结果
  if (runnerStatus !== 'ready') {
    return toJsonObject({
      ...diagnostic,
      executed: false,
      summary: `${String(diagnostic.summary ?? '')}（未执行真实测试命令）`,
    });
  }

  const targetProject = input.targetProject!;
  const testCommand = input.testCommand ?? 'npx playwright test --reporter=json';
  const timeoutMs = input.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  const { stdout, stderr, exitCode, timedOut } = await runPlaywrightCommand(
    targetProject,
    testCommand,
    timeoutMs,
  );

  const durationMs = Date.now() - startedAt;

  // 尝试解析 JSON 报告
  let reportJson: JsonObject | null = null;
  const jsonMatch = stdout.match(/\{[\s\S]*"stats"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      reportJson = JSON.parse(jsonMatch[0]) as JsonObject;
    } catch {
      reportJson = null;
    }
  }

  const statsRaw = reportJson?.stats as JsonObject | undefined;
  const stats = statsRaw
    ? {
        total: Number(statsRaw.expected ?? 0) + Number(statsRaw.unexpected ?? 0) + Number(statsRaw.skipped ?? 0),
        passed: Number(statsRaw.expected ?? 0),
        failed: Number(statsRaw.unexpected ?? 0),
        skipped: Number(statsRaw.skipped ?? 0),
      }
    : undefined;

  const failures = reportJson ? parseFailures(reportJson) : [];

  // 写入日志产物（可选）
  let logFile: string | undefined;
  if (input.outputDir) {
    try {
      await fs.mkdir(input.outputDir, { recursive: true });
      logFile = path.join(input.outputDir, 'playwright-exec.log');
      const log = [
        `# Playwright 执行日志`,
        `- 时间: ${new Date().toISOString()}`,
        `- 命令: ${testCommand}`,
        `- 退出码: ${exitCode ?? 'N/A'}`,
        `- 耗时: ${durationMs}ms`,
        `- 超时: ${timedOut ? '是' : '否'}`,
        '',
        '## stdout',
        stdout.slice(0, 200_000),
        '',
        '## stderr',
        stderr.slice(0, 100_000),
        '',
      ].join('\n');
      await fs.writeFile(logFile, log, 'utf8');
    } catch {
      logFile = undefined;
    }
  }

  const issues: ValidationIssue[] = [];
  for (const failure of failures) {
    issues.push({
      category: 'e2e',
      severity: 'high',
      message: `E2E 用例失败: ${failure.title}`,
      file: failure.file || undefined,
      suggestion: failure.error.slice(0, 200),
    });
  }
  if (timedOut) {
    issues.push({
      category: 'e2e',
      severity: 'high',
      message: `Playwright 执行超时（${timeoutMs}ms）`,
      suggestion: '检查测试用例是否挂起，或增大 timeoutMs',
    });
  }
  if (exitCode !== 0 && exitCode !== null && failures.length === 0) {
    issues.push({
      category: 'e2e',
      severity: 'medium',
      message: `Playwright 进程非零退出（code=${exitCode}），但未解析到失败用例`,
      suggestion: '查看执行日志定位问题',
    });
  }

  const report: ValidationReport = createValidationReport(issues);

  return toJsonObject({
    ...report,
    runnerStatus: report.passed ? 'passed' : 'failed',
    executed: true,
    summary: stats
      ? `Playwright 真实执行完成：${stats.total} 个用例，${stats.passed} 通过，${stats.failed} 失败，${stats.skipped} 跳过`
      : `Playwright 命令执行完成（exit=${exitCode ?? 'N/A'}），未解析到 JSON 统计`,
    command: testCommand,
    exitCode: exitCode ?? null,
    durationMs,
    stats: stats ?? null,
    failures: toJsonValue(failures),
    logFile,
    stdoutPreview: stdout.slice(0, 4000),
    stderrPreview: stderr.slice(0, 4000),
    details: {
      timedOut,
      reportParsed: reportJson !== null,
    },
  });
}

function toJsonObject<T>(value: T): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function toJsonValue<T>(value: T): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
