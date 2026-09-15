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
});
