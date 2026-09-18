// packages/pptx-core/src/__tests__/parse.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import { parseTemplate } from '../parse.js';

// 测试夹具：用 pptxgenjs 生成已知主题的小型 .pptx（临时目录，不入库）
// fixture 1：pptxgenjs 默认 Office 主题（accent1 = 4472C4，majorFont latin = Calibri Light）
//   + slide1 放一张 1×1 PNG（70 字节）用于媒体提取用例
// fixture 2：fixture 1 的后处理副本 —— theme1.xml 的 accent1 替换为 7C3AED（非 Office 默认色，
//   不触发兜底），注入 40KB image9.png / 35KB image10.png，并向母版 rels 追加 image10 的图片关系
let fixturePath: string;
let fixture2Path: string;
let corruptPath: string;

/** 1×1 像素 PNG（base64），解码后 70 字节 */
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

beforeAll(async () => {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W16x9', width: 10, height: 5.625 });
  pptx.layout = 'W16x9';
  const s1 = pptx.addSlide();
  s1.addText('模板封面', { x: 1, y: 1, w: 8, h: 1, color: '1D4ED8', fontFace: 'Impact' });
  s1.addImage({ data: `data:image/png;base64,${PNG_1PX}`, x: 1, y: 3, w: 1, h: 1 });
  const s2 = pptx.addSlide();
  s2.addText('模板内容页', { x: 1, y: 1, w: 8, h: 1, color: 'C2410C', fontFace: 'Courier New' });
  const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  fixturePath = path.join(os.tmpdir(), `ppt-fixture-${Date.now()}.pptx`);
  fs.writeFileSync(fixturePath, buf);

  // fixture 2：后处理 —— 定制 accent1 + 注入大图 + 母版 rels 追加 logo 关系
  const zip = await JSZip.loadAsync(buf);
  const themeXml = zip.file('ppt/theme/theme1.xml')!.async('string');
  zip.file('ppt/theme/theme1.xml', (await themeXml).replace('<a:srgbClr val="4472C4"/>', '<a:srgbClr val="7C3AED"/>'));
  zip.file('ppt/media/image9.png', Buffer.alloc(40 * 1024, 1)); // 40KB ≥ 30KB → backgroundPath
  zip.file('ppt/media/image10.png', Buffer.alloc(35 * 1024, 1)); // 35KB，logo 目标
  const masterRels = await zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels')!.async('string');
  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    masterRels.replace(
      '</Relationships>',
      '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image10.png"/></Relationships>'
    )
  );
  const buf2 = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer;
  fixture2Path = path.join(os.tmpdir(), `ppt-fixture2-${Date.now()}.pptx`);
  fs.writeFileSync(fixture2Path, buf2);

  // fixture 3：非 zip 损坏文件
  corruptPath = path.join(os.tmpdir(), `ppt-corrupt-${Date.now()}.pptx`);
  fs.writeFileSync(corruptPath, 'this is not a zip file');
});

afterAll(() => {
  for (const p of [fixturePath, fixture2Path, corruptPath]) {
    if (p) fs.unlinkSync(p);
  }
});

describe('parseTemplate 模板主题提取', () => {
  it('提取画幅比例 16:9 与 layoutDensity 默认 standard', async () => {
    const parsed = await parseTemplate(fixturePath);
    expect(parsed.theme.slideSize).toBe('16:9');
    expect(parsed.theme.layoutDensity).toBe('standard');
    expect(parsed.theme.mode).toBe('extracted');
  });

  it('Office 默认色 4472C4 命中时按页面用色频次兜底，dk1/lt1/lt2 仍走 clrScheme 映射', async () => {
    const parsed = await parseTemplate(fixturePath);
    // pptxgenjs v4 默认 accent1 = 4472C4（Office 默认色）→ 触发兜底：统计各页 srgbClr，
    // slide1 用 1D4ED8、slide2 用 C2410C（各 1 次），频次并列时按出现顺序取首色
    expect(parsed.theme.colors.primary).toBe('1D4ED8');
    expect(parsed.theme.colors.secondary).toBe('C2410C');
    // dk1/lt1/lt2 不受兜底影响，仍取自 clrScheme（dk1 为 sysClr，取 lastClr）
    expect(parsed.theme.colors.text).toBe('000000');
    expect(parsed.theme.colors.background).toBe('FFFFFF');
    expect(parsed.theme.colors.surface).toBe('E7E6E6');
  });

  it('从 fontScheme 提取字体（majorFont → fonts.title）', async () => {
    const parsed = await parseTemplate(fixturePath);
    // pptxgenjs v4 默认 majorFont latin = 'Calibri Light'，minorFont latin = 'Calibri'
    //（brief 原期望的 Calibri 实为 minorFont 值，已按真实产物修正）
    expect(parsed.theme.fonts.title).toBe('Calibri Light');
    expect(parsed.theme.fonts.body).toBe('Calibri');
  });

  it('theme.name 取文件名（去扩展名）', async () => {
    const parsed = await parseTemplate(fixturePath);
    expect(parsed.theme.name).toBe(path.basename(fixturePath, '.pptx'));
    expect(parsed.theme.mode).toBe('extracted');
  });

  it('accent1 非 Office 默认色时直接取 clrScheme 值（不触发兜底）', async () => {
    const parsed = await parseTemplate(fixture2Path);
    expect(parsed.theme.colors.primary).toBe('7C3AED');
    // accent2 直接映射为 secondary，未被兜底覆盖
    expect(parsed.theme.colors.secondary).toBe('ED7D31');
  });

  it('媒体资产：≥30KB 最大图作为背景，母版 rels 引用图作为 logo', async () => {
    const parsed = await parseTemplate(fixture2Path);
    expect(parsed.theme.assets?.backgroundPath).toBe('image9.png');
    expect(parsed.theme.assets?.logoPath).toBe('image10.png');
    expect(parsed.assets['image9.png']?.length).toBe(40 * 1024);
    expect(parsed.assets['image10.png']?.length).toBe(35 * 1024);
  });

  it('媒体资产：ppt/media/ 下图片全部提取（assets 键为文件名），小图不设背景', async () => {
    const parsed = await parseTemplate(fixturePath);
    const pngKey = Object.keys(parsed.assets).find((n) => n.endsWith('.png'));
    expect(pngKey).toBeDefined();
    expect(parsed.assets[pngKey!]!.length).toBeGreaterThan(0);
    // 70 字节小图未达 30KB 阈值，不设背景
    expect(parsed.theme.assets?.backgroundPath).toBeUndefined();
  });

  it('非 zip 损坏文件报错（JSZip 解包失败）', async () => {
    await expect(parseTemplate(corruptPath)).rejects.toThrow();
  });

  it('缺少 ppt/theme/theme1.xml 的合法 zip 报出明确错误', async () => {
    const zip = new JSZip();
    zip.file('ppt/presentation.xml', '<p:presentation/>');
    const buf = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer;
    const p = path.join(os.tmpdir(), `ppt-notheme-${Date.now()}.pptx`);
    fs.writeFileSync(p, buf);
    try {
      await expect(parseTemplate(p)).rejects.toThrow(/theme1\.xml/);
    } finally {
      fs.unlinkSync(p);
    }
  });

  it('缺少 ppt/presentation.xml 的合法 zip 报出明确错误', async () => {
    const zip = new JSZip();
    zip.file('ppt/theme/theme1.xml', '<a:theme/>');
    const buf = (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer;
    const p = path.join(os.tmpdir(), `ppt-nopres-${Date.now()}.pptx`);
    fs.writeFileSync(p, buf);
    try {
      await expect(parseTemplate(p)).rejects.toThrow(/presentation\.xml/);
    } finally {
      fs.unlinkSync(p);
    }
  });
});
