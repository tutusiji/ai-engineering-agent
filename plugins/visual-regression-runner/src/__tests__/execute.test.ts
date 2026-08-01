/**
 * visual-regression-runner 真实执行器单元测试
 *
 * 验证：
 * 1. profile 不支持视觉回归时降级为诊断
 * 2. 未提供待截图页面时降级为诊断
 * 3. 无基线时生成基线（baseline-created）
 * 4. 有基线时执行像素对比并输出 diff 图
 */

import { describe, it, expect, vi } from 'vitest';
import { executeVisualRegression } from '../execute.js';
import { promises as fs } from 'node:fs';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 模拟 playwright-core 的 chromium 与截图能力
vi.mock('playwright-core', () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

/** 生成一张指定颜色的简单 PNG 文件 */
function writeSolidPng(filePath: string, width: number, height: number, fill: number): void {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    png.data[idx] = fill; // R
    png.data[idx + 1] = fill; // G
    png.data[idx + 2] = fill; // B
    png.data[idx + 3] = 255; // A
  }
  writeFileSync(filePath, PNG.sync.write(png));
}

/** 创建 mock 浏览器上下文 */
function createMockBrowserContext() {
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockImplementation(async ({ path: savePath }: { path: string }) => {
      // 截图统一写深色（50），与亮色基线（200）形成差异
      writeSolidPng(savePath, 100, 100, 50);
    }),
  };
  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
  };
  (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(browser);
  return { browser, context, page };
}

/** 构造一个最小 projectScan */
function createScan(tmpDir: string) {
  return {
    rootDir: tmpDir,
    files: [],
    packageManager: 'pnpm',
    frameworkHints: [],
    uiLibraryHints: [],
    routingHints: [],
    counts: { sourceFiles: 0, pageFiles: 0, componentFiles: 0, hookFiles: 0, testFiles: 0 },
    pageFiles: [],
    componentFiles: [],
    hookFiles: [],
    testFiles: [],
    evidence: { loading: [], debounce: [], deleteConfirm: [] },
  };
}

describe('executeVisualRegression', () => {
  it('profile 不支持视觉回归时降级为诊断', async () => {
    const result = await executeVisualRegression({
      targetProfileId: 'react-admin',
      targetProject: '/tmp/nonexistent-project',
      projectScan: createScan('/tmp/nonexistent-project'),
      targetValidation: { visualRegression: false },
      pages: [{ name: 'home', url: 'http://localhost:3000' }],
    });

    expect(result.executed).toBe(false);
    expect(result.runnerStatus).toBe('unsupported');
    expect(chromium.launch).not.toHaveBeenCalled();
  });

  it('未提供待截图页面时降级为诊断', async () => {
    const result = await executeVisualRegression({
      targetProfileId: 'react-admin',
      targetProject: '/tmp/nonexistent-project',
      projectScan: createScan('/tmp/nonexistent-project'),
    });

    expect(result.executed).toBe(false);
    expect(chromium.launch).not.toHaveBeenCalled();
  });

  it('无基线时生成基线（baseline-created）', async () => {
    const { browser } = createMockBrowserContext();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vr-baseline-'));
    try {
      const result = await executeVisualRegression({
        targetProfileId: 'react-admin',
        targetProject: tmpDir,
        projectScan: createScan(tmpDir),
        pages: [{ name: 'home', url: 'http://localhost:3000' }],
      });

      expect(result.executed).toBe(true);
      expect(result.baselineMode).toBe(true);
      const results = result.results as Array<{ status: string; baselinePath: string; screenshotPath: string }>;
      expect(results).toHaveLength(1);
      expect(results[0]?.status).toBe('baseline-created');
      // 基线文件已写入
      const baseline = results[0]?.baselinePath;
      if (baseline) {
        const stat = await fs.stat(baseline);
        expect(stat.size).toBeGreaterThan(0);
      }
      // 浏览器已关闭
      expect(browser.close).toHaveBeenCalled();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('有基线时执行像素对比并输出 diff 图', async () => {
    const { browser } = createMockBrowserContext();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vr-compare-'));
    try {
      // 预置基线（白色）
      const baselineDir = path.join(tmpDir, 'artifacts', 'visual-baseline');
      await fs.mkdir(baselineDir, { recursive: true });
      writeSolidPng(path.join(baselineDir, 'home.png'), 100, 100, 200);

      const result = await executeVisualRegression({
        targetProfileId: 'react-admin',
        targetProject: tmpDir,
        projectScan: createScan(tmpDir),
        pages: [{ name: 'home', url: 'http://localhost:3000' }],
      });

      expect(result.executed).toBe(true);
      expect(result.baselineMode).toBe(false);
      const results = result.results as Array<{ status: string; diffRatio: number | null; diffPath: string }>;
      expect(results).toHaveLength(1);
      // 截图是深色（50），基线是亮色（200），应产生差异
      expect(results[0]?.status).toBe('failed');
      expect(results[0]?.diffRatio).toBeGreaterThan(0);
      // diff 图已输出
      const diffPath = results[0]?.diffPath;
      if (diffPath) {
        const stat = await fs.stat(diffPath);
        expect(stat.size).toBeGreaterThan(0);
      }
      // 浏览器已关闭
      expect(browser.close).toHaveBeenCalled();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
