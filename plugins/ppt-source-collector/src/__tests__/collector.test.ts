// ppt-source-collector 测试：三路输入归一化 + 真实文档解析（fixture）+ 边界（空/过短/过长/不支持格式）
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { collectSource, assemblePlatformDoc, pptSourceCollectorPlugin, type CollectInput } from '../index.js';
import type { Run } from '@ai-engineering-agent/persistence';

// 真实文档解析 fixture（.docx / .pdf 为最小可解析文件，随测试提交）
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

describe('collectSource 三路归一化', () => {
  it('paste 直通并统计字数', async () => {
    const r = await collectSource({ sourceType: 'paste', text: '# 二季度工作汇报\n完成 A 项目交付，效率提升 35%。' });
    expect(r.sourceType).toBe('paste');
    expect(r.markdown).toContain('35%');
    expect(r.meta.wordCount).toBeGreaterThan(10);
  });

  it('素材过短（<100 字）输出 warning', async () => {
    const r = await collectSource({ sourceType: 'paste', text: '太短了' });
    expect(r.meta.warnings.some((w) => w.includes('过短'))).toBe(true);
  });

  it('file 路径读 .md 文件归一化', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppt-col-'));
    const f = path.join(dir, 'memo.md');
    fs.writeFileSync(f, '# 备忘\n' + '内容行。'.repeat(30));
    const r = await collectSource({ sourceType: 'file', filePath: f });
    expect(r.markdown).toContain('备忘');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('platform-project 走注入的 fetchPlatformDoc', async () => {
    const r = await collectSource(
      { sourceType: 'platform-project', projectRunId: 'run-1' },
      { fetchPlatformDoc: async () => '# 项目介绍\n架构与页面规划内容。'.repeat(10) }
    );
    expect(r.markdown).toContain('架构与页面规划');
  });
});

describe('collectSource 真实文档解析（fixture）', () => {
  it('file 读 .docx（mammoth 默认解析器）', async () => {
    const r = await collectSource({ sourceType: 'file', filePath: path.join(FIXTURES_DIR, 'sample.docx') });
    expect(r.sourceType).toBe('file');
    expect(r.meta.fileName).toBe('sample.docx');
    expect(r.markdown).toContain('二季度工作汇报');
    expect(r.markdown).toContain('35%');
    expect(r.meta.wordCount).toBeGreaterThan(100);
  });

  it('file 读 .pdf（pdf-parse 默认解析器）', async () => {
    const r = await collectSource({ sourceType: 'file', filePath: path.join(FIXTURES_DIR, 'sample.pdf') });
    expect(r.meta.fileName).toBe('sample.pdf');
    expect(r.markdown).toContain('Quarterly');
  });
});

describe('collectSource 边界', () => {
  it('paste 空文本 → wordCount 0 + 过短 warning', async () => {
    const r = await collectSource({ sourceType: 'paste', text: '' });
    expect(r.meta.wordCount).toBe(0);
    expect(r.meta.warnings.some((w) => w.includes('过短'))).toBe(true);
  });

  it('paste 超长（>2 万字）→ 过长 warning', async () => {
    const r = await collectSource({ sourceType: 'paste', text: '字'.repeat(20001) });
    expect(r.meta.wordCount).toBe(20001);
    expect(r.meta.warnings.some((w) => w.includes('过长'))).toBe(true);
  });

  it('不支持的扩展名抛出明确错误', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppt-col-'));
    const f = path.join(dir, 'photo.png');
    fs.writeFileSync(f, 'fake');
    await expect(collectSource({ sourceType: 'file', filePath: f })).rejects.toThrow('不支持');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('file 缺 filePath 抛出明确错误', async () => {
    await expect(collectSource({ sourceType: 'file' })).rejects.toThrow('filePath');
  });

  it('未知 sourceType 抛出明确错误', async () => {
    const bad = { sourceType: 'url' } as unknown as CollectInput;
    await expect(collectSource(bad)).rejects.toThrow('不支持的素材来源');
  });

  it('platform-project 缺 projectRunId 抛出明确错误', async () => {
    await expect(collectSource({ sourceType: 'platform-project' })).rejects.toThrow('projectRunId');
  });
});

describe('assemblePlatformDoc（平台 run 文档拼接，无 DB 纯函数测试）', () => {
  /** 构造最小 Run 记录 */
  function fakeRun(stages: Array<{ id: string; result?: unknown }>): Run {
    return {
      id: 'run-1',
      workflowId: 'wf-1',
      workflowName: 'wf',
      status: 'completed',
      stages: stages.map((s) => ({
        id: s.id,
        name: s.id,
        nodeType: 'agent',
        status: 'completed',
        logs: [],
        result: s.result,
      })),
      approvalHistory: [],
      artifacts: [],
      startedAt: 0,
      trigger: 'manual',
    };
  }

  it('按 interactive_requirement → architecture_planning → page_planning 顺序拼接三节', () => {
    const md = assemblePlatformDoc(
      fakeRun([
        { id: 'interactive_requirement', result: { featureName: '巡检系统' } },
        { id: 'architecture_planning', result: { overview: '三层架构' } },
        { id: 'page_planning', result: { pages: [{ name: '首页' }] } },
      ])
    );
    const i1 = md.indexOf('## 需求文档');
    const i2 = md.indexOf('## 架构设计方案');
    const i3 = md.indexOf('## 页面规划');
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
    expect(md).toContain('巡检系统');
  });

  it('无数据的节点跳过该节', () => {
    const md = assemblePlatformDoc(
      fakeRun([{ id: 'interactive_requirement', result: { featureName: '巡检系统' } }, { id: 'architecture_planning' }])
    );
    expect(md).toContain('## 需求文档');
    expect(md).not.toContain('## 架构设计方案');
    expect(md).not.toContain('## 页面规划');
  });
});

describe('pptSourceCollectorPlugin（plugin 适配层）', () => {
  /** 构造最小 PluginContext — execute 完全由 input 驱动，ctx 仅满足签名 */
  const ctx = {} as unknown as Parameters<typeof pptSourceCollectorPlugin.execute>[0];

  it('execute 从 input.source 解包素材并产出 ppt-source 结构', async () => {
    const result = await pptSourceCollectorPlugin.execute(ctx, {
      source: { sourceType: 'paste', text: '# 二季度工作汇报\n\n完成 A 项目交付，整体效率提升 35%。' },
    });
    expect(result.ok).toBe(true);
    expect(result.output?.sourceType).toBe('paste');
    expect(result.output?.markdown).toContain('二季度工作汇报');
    expect((result.output?.meta as { wordCount: number }).wordCount).toBeGreaterThan(0);
    expect(Array.isArray((result.output?.meta as { warnings: string[] }).warnings)).toBe(true);
  });

  it('execute 直接传 CollectInput（无 source 包裹）同样可用', async () => {
    const result = await pptSourceCollectorPlugin.execute(ctx, {
      sourceType: 'paste',
      text: '直接传入的素材文本',
    });
    expect(result.ok).toBe(true);
    expect(result.output?.sourceType).toBe('paste');
  });
});
