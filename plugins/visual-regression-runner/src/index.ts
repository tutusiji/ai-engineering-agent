import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import { createValidationReport } from '@ai-engineering-agent/validation-core';
import type { ProjectScanReport } from '@ai-engineering-agent/project-scanner';

export interface VisualRegressionRunnerInput {
  targetProfileId: string;
  targetProject?: string;
  projectScan?: ProjectScanReport;
  generationReport?: JsonObject;
  targetValidation?: JsonObject;
}

export async function buildVisualRegressionValidation(input: VisualRegressionRunnerInput): Promise<JsonObject> {
  const visualCapability = input.targetValidation?.visualRegression;
  if (visualCapability === false) {
    return toJsonObject({
      ...createValidationReport([]),
      runnerStatus: 'unsupported',
      summary: '当前 target profile 不支持视觉回归',
      suggestions: ['改用人工验收或平台原生截图能力'],
    });
  }

  if (!input.targetProject) {
    return toJsonObject({
      ...createValidationReport([]),
      runnerStatus: 'missing-project',
      summary: '未提供目标仓库路径，暂时无法判断视觉回归是否可执行',
      suggestions: ['为执行器补充 targetProject 路径'],
    });
  }

  const baselineDirs = await detectExistingPaths(input.targetProject, [
    'artifacts/visual-baseline',
    'tests/visual',
    '__screenshots__',
    '__image_snapshots__',
  ]);
  const screenshotDirs = await detectExistingPaths(input.targetProject, [
    'artifacts/screenshots',
    'playwright-report',
    'test-results',
  ]);
  const visualFiles = detectVisualFiles(input.projectScan);
  const generatedFiles = Array.isArray(input.generationReport?.generatedFiles)
    ? (input.generationReport.generatedFiles as Array<{ path?: string }>).map((item) => item.path).filter(Boolean)
    : [];

  if (visualCapability === 'limited') {
    return toJsonObject({
      ...createValidationReport([]),
      runnerStatus: 'limited',
      summary: '当前 target profile 仅支持受限视觉校验，建议先保留诊断与人工抽检模式',
      details: {
        baselineDirs,
        screenshotDirs,
        visualFiles,
        generatedFiles,
      },
    });
  }

  if (baselineDirs.length === 0 && visualFiles.length === 0) {
    return toJsonObject({
      ...createValidationReport([]),
      runnerStatus: 'not-configured',
      summary: '目标仓库尚未发现视觉基线目录或视觉测试线索',
      suggestions: ['建立基线截图目录', '补充视觉对比脚本或截图测试用例'],
      details: {
        baselineDirs,
        screenshotDirs,
        visualFiles,
        generatedFiles,
      },
    });
  }

  if (baselineDirs.length === 0 || screenshotDirs.length === 0) {
    const missing = [
      baselineDirs.length === 0 ? '基线目录' : null,
      screenshotDirs.length === 0 ? '截图产物目录' : null,
    ].filter(Boolean);
    return toJsonObject({
      ...createValidationReport([
        {
          category: 'visual',
          severity: 'medium',
          message: `视觉回归环境未补齐：缺少${missing.join('、')}`,
          suggestion: '补齐基线目录与截图输出目录后，再接入真实 diff 执行',
        },
      ]),
      runnerStatus: 'incomplete',
      summary: '目标仓库已有部分视觉回归线索，但运行条件未完全满足',
      details: {
        baselineDirs,
        screenshotDirs,
        visualFiles,
        generatedFiles,
      },
    });
  }

  return toJsonObject({
    ...createValidationReport([]),
    runnerStatus: 'ready',
    summary: '目标仓库已具备视觉回归的基础目录与测试线索',
    details: {
      baselineDirs,
      screenshotDirs,
      visualFiles,
      generatedFiles,
    },
  });
}

async function detectExistingPaths(rootDir: string, relativePaths: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const relativePath of relativePaths) {
    try {
      await fs.access(path.join(rootDir, relativePath));
      results.push(relativePath);
    } catch {
      // noop
    }
  }
  return results;
}

function detectVisualFiles(projectScan?: ProjectScanReport): string[] {
  const files = projectScan?.files ?? [];
  return files.filter((file) => /visual|screenshot|snapshot|pixelmatch|diff/i.test(file)).slice(0, 20);
}

function toJsonObject<T>(value: T): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}
