import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPptx, type PptContent } from '../index.js';
import type { PptTheme } from '../types.js';

const THEME: PptTheme = {
  name: '测试主题',
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
  deckTitle: '二季度工作汇报',
  subtitle: '研发效能提升',
  audience: '管理层',
  slides: [
    { pageNo: 1, pageType: 'cover', title: '', polishedTitle: '二季度工作汇报' },
    {
      pageNo: 2,
      pageType: 'content-bullets',
      title: '研发投入',
      polishedTitle: '研发投入翻倍',
      bullets: ['招聘 20 人', '交付提速 35%'],
      polishedBullets: ['团队扩至 42 人', '交付周期缩短 35%'],
      hookLine: '交付提速 35%',
      notes: '强调速度提升来自流程改造',
    },
  ],
};

describe('buildPptx', () => {
  it('按页数生成 slide XML，且包含美化后的文本', async () => {
    const buf = await buildPptx(CONTENT, THEME);
    expect(buf.length).toBeGreaterThan(1000);
    const zip = await JSZip.loadAsync(buf);
    const slideFiles = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    expect(slideFiles).toHaveLength(2);
    const slide2 = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(slide2).toContain('研发投入翻倍');
    expect(slide2).toContain('交付周期缩短 35%');
  });

  it('4:3 主题正常生成', async () => {
    const buf = await buildPptx(CONTENT, { ...THEME, slideSize: '4:3' });
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file('ppt/slides/slide1.xml')).toBeDefined();
  });

  it('闸 B：assetName 携带 ../ 逃逸出 assetBasePath 时静默降级为纯色，合法路径仍正常嵌入', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppt-gateb-'));
    const base = path.join(dir, 'base');
    fs.mkdirSync(base);
    // 越界目标：base 之外的同级文件，内容带唯一标记
    const ESCAPE_MARKER = 'ASSET-ESCAPE-MARKER';
    fs.writeFileSync(path.join(dir, 'escape.txt'), ESCAPE_MARKER);
    // 合法资产：base 内的真实 1×1 PNG
    const PNG_1PX = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    fs.writeFileSync(path.join(base, 'ok.png'), PNG_1PX);
    try {
      // 越界：../ 逃逸出 base → 降级纯色，pptx 不含任何 media 条目，全包无逃逸标记字节
      const escapeTheme: PptTheme = { ...THEME, assetBasePath: base, assets: { coverImagePath: '../escape.txt' } };
      const escapeZip = await JSZip.loadAsync(await buildPptx(CONTENT, escapeTheme));
      // pptxgenjs 总会写入 ppt/media/ 目录条目本身，须排除空目录条目后断言无真实媒体文件
      expect(Object.keys(escapeZip.files).filter((n) => n.startsWith('ppt/media/') && !n.endsWith('/'))).toHaveLength(
        0
      );
      for (const name of Object.keys(escapeZip.files)) {
        if (name.endsWith('/')) continue; // 空目录条目无文件内容，zip.file() 对其返回 null
        const content = (await escapeZip.file(name)!.async('string')).slice(0, 512);
        expect(content.includes(ESCAPE_MARKER)).toBe(false);
      }

      // 回归底线：base 内合法文件照常嵌入（闸 B 不破坏合法形状的资产加载）
      const okTheme: PptTheme = { ...THEME, assetBasePath: base, assets: { coverImagePath: 'ok.png' } };
      const okZip = await JSZip.loadAsync(await buildPptx(CONTENT, okTheme));
      const media = Object.keys(okZip.files).filter((n) => n.startsWith('ppt/media/') && !n.endsWith('/'));
      expect(media.length).toBeGreaterThan(0);
      const mediaBytes = await okZip.file(media[0]!)!.async('nodebuffer');
      expect(mediaBytes.equals(PNG_1PX)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('闸 B：无 assetBasePath 时不做任何资产读取（防 coverImagePath 直读 cwd 相对/绝对路径）', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppt-gateb2-'));
    const outside = path.join(dir, 'target.txt');
    fs.writeFileSync(outside, 'NO-BASE-ESCAPE-MARKER');
    try {
      // 客户端 theme 只给 coverImagePath（绝对路径）不带 assetBasePath → 必须降级纯色
      const theme: PptTheme = { ...THEME, assets: { coverImagePath: outside } };
      const zip = await JSZip.loadAsync(await buildPptx(CONTENT, theme));
      // pptxgenjs 总会写入 ppt/media/ 目录条目本身，须排除空目录条目后断言无真实媒体文件
      expect(Object.keys(zip.files).filter((n) => n.startsWith('ppt/media/') && !n.endsWith('/'))).toHaveLength(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('列表逐项分段：每条要点独占一个 <a:p>，bullet 页逐项渲染项目符号', async () => {
    // 回归锁：pptxgenjs 仅在项间存在 bullet/align 变化/breakLine 时切分段落，
    // 缺省时多项会被合并进单个 <a:p>（目录曾渲染成「条目一条目二条目三」）
    const listContent: PptContent = {
      deckTitle: '分段回归',
      slides: [
        { pageNo: 1, pageType: 'toc', title: '', polishedTitle: '目录', polishedBullets: ['一', '二', '三'] },
        {
          pageNo: 2,
          pageType: 'content-bullets',
          title: '',
          polishedTitle: '要点页',
          polishedBullets: ['甲', '乙', '丙'],
          hookLine: '金句',
        },
        {
          pageNo: 3,
          pageType: 'content-two-col',
          title: '',
          polishedTitle: '双栏页',
          polishedBullets: ['1', '2', '3', '4'],
          hookLine: '强调',
        },
      ],
    };
    const zip = await JSZip.loadAsync(await buildPptx(listContent, THEME));
    const count = (xml: string, token: string): number => (xml.match(new RegExp(token, 'g')) ?? []).length;

    // toc：标题 1 段 + 3 条要点各 1 段 = 4
    const toc = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(count(toc, '<a:p>')).toBe(4);

    // content-bullets：标题 1 + hookLine 1 + 3 条要点 = 5 段，且 3 个项目符号
    const bullets = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(count(bullets, '<a:p>')).toBe(5);
    expect(count(bullets, 'buChar')).toBe(3);

    // content-two-col：标题 1 + hookLine 1 + 左栏 2 + 右栏 2 = 6 段，无项目符号
    const twoCol = await zip.file('ppt/slides/slide3.xml')!.async('string');
    expect(count(twoCol, '<a:p>')).toBe(6);
    expect(count(twoCol, 'buChar')).toBe(0);
  });
});
