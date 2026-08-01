/**
 * playwright-runner 真实执行器单元测试
 *
 * 验证：
 * 1. 不满足执行条件时降级为诊断（executed=false）
 * 2. 命令执行失败时输出非零退出码与错误摘要
 * 3. JSON 报告解析能提取失败用例
 * 4. 日志产物写入 outputDir
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// mock 声明必须位于 execute 模块 import 之前（vitest hoist 保证先注册）
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

import { executePlaywrightValidation } from '../execute.js';


/** 构造一个模拟子进程 */
function createMockChild(options: {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  spawnError?: string;
}) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  // 在 spawn 被调用时才安排事件触发，确保 close 一定发生在调用之后
  (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
    setTimeout(() => {
      if (options.spawnError) {
        child.emit('error', new Error(options.spawnError));
        return;
      }
      child.stdout?.emit('data', Buffer.from(options.stdout ?? ''));
      child.stderr?.emit('data', Buffer.from(options.stderr ?? ''));
      child.emit('close', options.exitCode ?? 0);
    }, 5);
    return child;
  });

  return child;
}

/** 构造一个含 playwright 配置的临时项目目录 */
async function createPlaywrightFixture(files: string[]): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pw-runner-'));
  await fs.writeFile(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({ devDependencies: { '@playwright/test': '^1.40.0' } }),
  );
  await fs.writeFile(path.join(tmpDir, 'playwright.config.ts'), 'export default {};');
  for (const file of files) {
    const filePath = path.join(tmpDir, file);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'test();');
  }
  return tmpDir;
}

/** 构造一个最小的 projectScan 报告 */
function createScan(tmpDir: string, files: string[]) {
  return {
    rootDir: tmpDir,
    files,
    packageManager: 'pnpm',
    frameworkHints: [],
    uiLibraryHints: [],
    routingHints: [],
    counts: { sourceFiles: files.length, pageFiles: 0, componentFiles: 0, hookFiles: 0, testFiles: files.length },
    pageFiles: [],
    componentFiles: [],
    hookFiles: [],
    testFiles: files,
    evidence: { loading: [], debounce: [], deleteConfirm: [] },
  };
}

describe('executePlaywrightValidation', () => {
  it('不满足执行条件（missing-project）时降级为诊断，不执行命令', async () => {
    const result = await executePlaywrightValidation({
      targetProfileId: 'react-admin',
    });

    expect(result.executed).toBe(false);
    expect(result.runnerStatus).toBe('missing-project');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('具备条件时真实执行命令并解析通过结果', async () => {
    createMockChild({
      stdout: JSON.stringify({
        stats: { expected: 3, unexpected: 0, skipped: 1 },
        suites: [],
      }),
      exitCode: 0,
    });

    const tmpDir = await createPlaywrightFixture(['e2e.spec.ts']);
    try {
      const result = await executePlaywrightValidation({
        targetProfileId: 'react-admin',
        targetProject: tmpDir,
        projectScan: createScan(tmpDir, ['e2e.spec.ts']),
      });

      expect(result.executed).toBe(true);
      expect(result.runnerStatus).toBe('passed');
      expect(spawn).toHaveBeenCalledTimes(1);
      const stats = result.stats as { total: number; passed: number; failed: number; skipped: number };
      expect(stats.total).toBe(4);
      expect(stats.passed).toBe(3);
      expect(stats.failed).toBe(0);
      expect(stats.skipped).toBe(1);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('解析失败用例并生成 high 严重度问题', async () => {
    createMockChild({
      stdout: JSON.stringify({
        stats: { expected: 1, unexpected: 1, skipped: 0 },
        suites: [
          {
            specs: [
              {
                title: '用户登录',
                tests: [
                  {
                    title: '登录成功',
                    file: 'e2e/login.spec.ts',
                    results: [
                      {
                        status: 'failed',
                        error: { message: 'expect timeout: 元素未找到' },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
      exitCode: 1,
    });

    const tmpDir = await createPlaywrightFixture(['e2e/login.spec.ts']);
    try {
      const result = await executePlaywrightValidation({
        targetProfileId: 'react-admin',
        targetProject: tmpDir,
        projectScan: createScan(tmpDir, ['e2e/login.spec.ts']),
      });

      expect(result.executed).toBe(true);
      expect(result.runnerStatus).toBe('failed');
      const failures = result.failures as Array<{ title: string; file: string; error: string }>;
      expect(failures).toHaveLength(1);
      expect(failures[0]?.title).toContain('登录成功');
      expect(failures[0]?.error).toContain('元素未找到');

      const issues = result.issues as Array<{ category: string; severity: string; message: string }>;
      expect(issues.some((i) => i.category === 'e2e' && i.severity === 'high')).toBe(true);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('输出日志产物到 outputDir', async () => {
    createMockChild({
      stdout: JSON.stringify({ stats: { expected: 1, unexpected: 0, skipped: 0 }, suites: [] }),
      exitCode: 0,
    });

    const tmpDir = await createPlaywrightFixture(['smoke.spec.ts']);
    const outputDir = path.join(tmpDir, 'artifacts', 'playwright');
    try {
      const result = await executePlaywrightValidation({
        targetProfileId: 'react-admin',
        targetProject: tmpDir,
        projectScan: createScan(tmpDir, ['smoke.spec.ts']),
        outputDir,
      });

      expect(result.executed).toBe(true);
      const logFile = result.logFile as string;
      expect(logFile).toBeTruthy();
      const log = await fs.readFile(logFile, 'utf8');
      expect(log).toContain('Playwright 执行日志');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
