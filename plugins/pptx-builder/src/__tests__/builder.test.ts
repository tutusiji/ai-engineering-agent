// pptx-builder 测试：computeFitting 预算比对 + plugin execute（超预算拒建 / 构建落盘发布）
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeFitting, pptxBuilderPlugin } from '../index.js';
import type { PptContent, PptTheme } from '@ai-engineering-agent/pptx-core';
import type { PluginContext } from '@ai-engineering-agent/plugin-sdk';
import type { ArtifactRef, JsonObject } from '@ai-engineering-agent/shared-types';

const THEME: PptTheme = {
  name: 't',
  mode: 'preset',
  colors: {
    primary: '1D4ED8',
    secondary: '3B82F6',
    background: 'FFFFFF',
    surface: 'EFF6FF',
    text: '0F172A',
    accent: 'F59E0B',
  },
  fonts: { title: 'Arial', body: 'Arial' },
  slideSize: '16:9',
  layoutDensity: 'standard',
};

const CONTENT: PptContent = {
  deckTitle: 't',
  slides: [
    { pageNo: 1, pageType: 'content-bullets', title: 't', polishedTitle: '正常页', polishedBullets: ['短要点'] },
    {
      pageNo: 2,
      pageType: 'content-bullets',
      title: 't',
      polishedTitle: '超预算页',
      polishedBullets: Array.from({ length: 6 }, (_, i) => '要点'.repeat(7) + String(i)),
    },
  ],
};

/** 工作流 JSON 边界输入 — 接口类型无隐式索引签名，经 JSON 往返转成 JsonObject（等价于上游节点的 JSON 产出） */
function jsonInput(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

describe('computeFitting', () => {
  it('第 2 页超预算 → 产生含页码的警告', () => {
    const warnings = computeFitting(CONTENT, THEME);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('第 2 页');
  });
  it('达标内容零警告', () => {
    const warnings = computeFitting({ ...CONTENT, slides: [CONTENT.slides[0]] }, THEME);
    expect(warnings).toHaveLength(0);
  });
});

describe('pptxBuilderPlugin execute', () => {
  /** 构造临时目录上下文，并记录 publish 替身调用参数（回填固定 artifact id） */
  function makeCtx(): { ctx: PluginContext; tmpDir: string; published: Array<Omit<ArtifactRef, 'id'>> } {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppt-build-'));
    const published: Array<Omit<ArtifactRef, 'id'>> = [];
    const ctx: PluginContext = {
      runId: 'run-fit-1',
      nodeId: 'pptx_build',
      workspaceRoot: tmpDir,
      env: {},
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      artifacts: {
        publish: async (artifact) => {
          published.push(artifact);
          return { id: 'artifact-fit-1', ...artifact };
        },
      },
    };
    return { ctx, tmpDir, published };
  }

  it('警告 ≤ 2 处 → ok:true，构建落盘并发布 artifact', async () => {
    const { ctx, tmpDir, published } = makeCtx();
    // CONTENT 恰有 1 处超预算（第 2 页 6 条 > 预算 5 条），未超阈值 → 正常构建
    const result = await pptxBuilderPlugin.execute(ctx, jsonInput({ content: CONTENT, theme: THEME }));
    expect(result.ok).toBe(true);
    const outPath = path.join(tmpDir, 'artifacts-ppt', 'run-fit-1.pptx');
    const file = fs.statSync(outPath);
    expect(file.size).toBeGreaterThan(1000); // 二进制为合法 pptx（zip 容器量级）
    expect(published).toHaveLength(1);
    expect(published[0].kind).toBe('pptx');
    expect(published[0].path).toBe(outPath);
    expect(published[0].metadata).toEqual({ pageCount: 2, sizeBytes: file.size });
    expect(result.output).toEqual({
      ok: true,
      artifactId: 'artifact-fit-1',
      pageCount: 2,
      warnings: ['第 2 页：要点 6 条超出预算 5 条'],
    });
    expect(result.artifacts?.[0]?.id).toBe('artifact-fit-1');
  });

  it('警告恰好 2 处 → 仍 ok:true（阈值是 >2 而非 ≥2）', async () => {
    const { ctx, published } = makeCtx();
    // 复制第 2 页为第 3 页 → 2 处超预算警告，恰在阈值内
    const twoOver = { ...CONTENT, slides: [CONTENT.slides[0], CONTENT.slides[1], { ...CONTENT.slides[1], pageNo: 3 }] };
    const result = await pptxBuilderPlugin.execute(ctx, jsonInput({ content: twoOver, theme: THEME }));
    expect(result.ok).toBe(true);
    expect(published).toHaveLength(1);
  });

  it('警告 > 2 处 → ok:false 携带逐条 validation issues，不落盘不发布', async () => {
    const { ctx, tmpDir, published } = makeCtx();
    // 三页均 6 条要点（预算 5 条）→ 3 条警告，超阈值拒建
    const threeOver = { ...CONTENT, slides: [1, 2, 3].map((n) => ({ ...CONTENT.slides[1], pageNo: n })) };
    const result = await pptxBuilderPlugin.execute(ctx, jsonInput({ content: threeOver, theme: THEME }));
    expect(result.ok).toBe(false);
    expect(result.validation?.passed).toBe(false);
    expect(result.validation?.issues).toHaveLength(3);
    expect(result.validation?.issues.every((issue) => issue.category === 'rule')).toBe(true);
    expect(result.validation?.issues.every((issue) => issue.severity === 'high')).toBe(true);
    expect(result.validation?.issues.every((issue) => issue.message.includes('超出预算'))).toBe(true);
    expect(result.validation?.issues[0]?.message).toContain('第 1 页');
    // 拒建路径不产生任何文件与 artifact
    expect(fs.existsSync(path.join(tmpDir, 'artifacts-ppt'))).toBe(false);
    expect(published).toHaveLength(0);
  });
});
