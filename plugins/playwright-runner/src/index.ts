import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { JsonObject, JsonValue, ValidationReport } from '@ai-engineering-agent/shared-types';
import { createValidationReport } from '@ai-engineering-agent/validation-core';
import type { ProjectScanReport } from '@ai-engineering-agent/project-scanner';

export interface PlaywrightRunnerInput {
  targetProfileId: string;
  targetProject?: string;
  projectScan?: ProjectScanReport;
  targetValidation?: JsonObject;
}

export async function buildPlaywrightValidation(input: PlaywrightRunnerInput): Promise<JsonObject> {
  const supportsPlaywright = input.targetValidation?.playwright !== false;
  const targetProject = input.targetProject;

  if (!supportsPlaywright) {
    return toJsonObject({
      ...createValidationReport([]),
      runnerStatus: 'unsupported',
      summary: '当前 target profile 不支持 Playwright 冒烟执行',
      suggestions: ['改用平台原生自动化能力，或在 workflow 中跳过该节点'],
    });
  }

  if (!targetProject) {
    return toJsonObject({
      ...createValidationReport([]),
      runnerStatus: 'missing-project',
      summary: '未提供目标仓库路径，暂时无法判断 Playwright 是否可执行',
      suggestions: ['为执行器补充 targetProject 路径'],
    });
  }

  const configFiles = await detectConfigFiles(targetProject);
  const hasPlaywrightDependency = await detectPlaywrightDependency(targetProject);
  const testFiles = detectPlaywrightTests(input.projectScan);

  if (!hasPlaywrightDependency && configFiles.length === 0 && testFiles.length === 0) {
    return toJsonObject({
      ...createValidationReport([]),
      runnerStatus: 'not-configured',
      summary: '目标仓库尚未发现 Playwright 依赖、配置或测试文件',
      suggestions: ['添加 `@playwright/test` 依赖', '新增 `playwright.config.ts` 与最小 smoke 用例'],
      details: {
        configFiles,
        testFiles,
        hasPlaywrightDependency,
      },
    });
  }

  if (!hasPlaywrightDependency || configFiles.length === 0 || testFiles.length === 0) {
    const missing = [
      !hasPlaywrightDependency ? '依赖' : null,
      configFiles.length === 0 ? '配置文件' : null,
      testFiles.length === 0 ? '测试用例' : null,
    ].filter(Boolean);

    const report: ValidationReport = createValidationReport([
      {
        category: 'e2e',
        severity: 'medium',
        message: `Playwright 环境未补齐：缺少${missing.join('、')}`,
        suggestion: '补齐依赖、配置和最小 smoke 测试后，再接入真实执行命令',
      },
    ]);

    return toJsonObject({
      ...report,
      runnerStatus: 'incomplete',
      summary: '目标仓库已有部分 Playwright 线索，但运行条件未完全满足',
      details: {
        configFiles,
        testFiles,
        hasPlaywrightDependency,
      },
    });
  }

  return toJsonObject({
    ...createValidationReport([]),
    runnerStatus: 'ready',
    summary: '目标仓库已具备 Playwright 冒烟执行的基本条件',
    details: {
      configFiles,
      testFiles,
      hasPlaywrightDependency,
    },
  });
}

function toJsonObject<T>(value: T): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

async function detectConfigFiles(rootDir: string): Promise<string[]> {
  const candidates = [
    'playwright.config.ts',
    'playwright.config.js',
    'playwright.config.mts',
    'playwright.config.mjs',
  ];

  const results: string[] = [];
  for (const candidate of candidates) {
    try {
      await fs.access(path.join(rootDir, candidate));
      results.push(candidate);
    } catch {
      // noop
    }
  }
  return results;
}

async function detectPlaywrightDependency(rootDir: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(path.join(rootDir, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return Boolean(
      parsed.dependencies?.['@playwright/test'] ||
      parsed.devDependencies?.['@playwright/test'] ||
      parsed.dependencies?.playwright ||
      parsed.devDependencies?.playwright,
    );
  } catch {
    return false;
  }
}

function detectPlaywrightTests(projectScan?: ProjectScanReport): string[] {
  const files = projectScan?.files ?? [];
  return files.filter((file) => /playwright|e2e|smoke/i.test(file)).slice(0, 20);
}
