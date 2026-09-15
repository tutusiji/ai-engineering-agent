import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
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
