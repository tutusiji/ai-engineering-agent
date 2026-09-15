// 类型仅作标注用（type 导入在运行时被擦除）；运行时改为 buildPptx 内动态导入，以兼容 tsx 运行时
// （tsx 下对 pptxgenjs 的静态默认导入会得到非构造函数对象，详见 task-3 报告）
import type PptxGenJS from 'pptxgenjs';
import { join } from 'node:path';
import type { PptContent, PptContentSlide } from './types.js';
import type { PptTheme } from './types.js';

/** 解析资产文件为 data URI（图片以 base64 内嵌，避免文件路径问题） */
async function toDataUri(path: string | undefined, mime = 'image/png'): Promise<string | undefined> {
  if (!path) return undefined;
  const { readFile } = await import('node:fs/promises');
  try {
    const buf = await readFile(path);
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return undefined; // 资产缺失时静默降级为纯色版式
  }
}

/** 将字符串数组转为 pptxgenjs 的 TextProps[]（v4 的 addText 不接受裸字符串数组） */
function toTextProps(items: string[]): PptxGenJS.TextProps[] {
  return items.map((text) => ({ text }));
}

/** 渲染单页：按 pageType 分派到对应版式 */
function renderSlide(pptx: PptxGenJS, slide: PptContentSlide, theme: PptTheme, coverImg?: string): void {
  const s = pptx.addSlide();
  const { colors, fonts } = theme;
  s.background = { color: colors.background };

  if (slide.pageType === 'cover') {
    if (coverImg)
      s.addImage({ data: coverImg, x: 0, y: 0, w: '100%', h: '100%', sizing: { type: 'cover', w: '100%', h: '100%' } });
    s.addText(slide.polishedTitle, {
      x: 0.6,
      y: 2.2,
      w: 8.8,
      h: 1.2,
      fontSize: 40,
      bold: true,
      color: colors.text,
      fontFace: fonts.title,
    });
    return;
  }
  if (slide.pageType === 'toc') {
    s.addText(slide.polishedTitle, {
      x: 0.6,
      y: 0.4,
      w: 8.8,
      h: 0.8,
      fontSize: 28,
      bold: true,
      color: colors.primary,
      fontFace: fonts.title,
    });
    s.addText(toTextProps(slide.polishedBullets ?? []), {
      x: 0.8,
      y: 1.5,
      w: 8.4,
      h: 3.6,
      fontSize: 16,
      color: colors.text,
      fontFace: fonts.body,
      lineSpacingMultiple: 1.4,
    });
    return;
  }
  if (slide.pageType === 'section') {
    s.background = { color: colors.primary };
    s.addText(slide.polishedTitle, {
      x: 0.8,
      y: 2.4,
      w: 8.4,
      h: 1.2,
      fontSize: 32,
      bold: true,
      color: colors.background,
      fontFace: fonts.title,
    });
    return;
  }
  if (slide.pageType === 'quote') {
    s.addText(`"${slide.hookLine ?? slide.polishedTitle}"`, {
      x: 1.0,
      y: 2.0,
      w: 8.0,
      h: 2.0,
      fontSize: 26,
      italic: true,
      color: colors.primary,
      fontFace: fonts.title,
      align: 'center',
    });
    return;
  }
  if (slide.pageType === 'ending') {
    s.background = { color: colors.primary };
    s.addText(slide.polishedTitle, {
      x: 0.8,
      y: 2.6,
      w: 8.4,
      h: 1.0,
      fontSize: 32,
      bold: true,
      color: colors.background,
      fontFace: fonts.title,
      align: 'center',
    });
    return;
  }

  // ── content-bullets / content-two-col：标题栏 + 要点区（双栏则左右分栏） ──
  s.addShape('rect', { x: 0, y: 0, w: '100%', h: 1.0, fill: { color: colors.surface } });
  s.addText(slide.polishedTitle, {
    x: 0.5,
    y: 0.15,
    w: 9.0,
    h: 0.7,
    fontSize: 22,
    bold: true,
    color: colors.primary,
    fontFace: fonts.title,
  });
  if (slide.hookLine) {
    s.addText(slide.hookLine, {
      x: 6.4,
      y: 0.15,
      w: 3.2,
      h: 0.7,
      fontSize: 14,
      color: colors.accent,
      fontFace: fonts.body,
      align: 'right',
    });
  }
  const bullets = slide.polishedBullets ?? [];
  if (slide.pageType === 'content-two-col') {
    const mid = Math.ceil(bullets.length / 2);
    s.addText(toTextProps(bullets.slice(0, mid)), {
      x: 0.6,
      y: 1.4,
      w: 4.2,
      h: 4.2,
      fontSize: 15,
      color: colors.text,
      fontFace: fonts.body,
      lineSpacingMultiple: 1.35,
    });
    s.addText(toTextProps(bullets.slice(mid)), {
      x: 5.2,
      y: 1.4,
      w: 4.2,
      h: 4.2,
      fontSize: 15,
      color: colors.text,
      fontFace: fonts.body,
      lineSpacingMultiple: 1.35,
    });
  } else {
    s.addText(toTextProps(bullets), {
      x: 0.8,
      y: 1.4,
      w: 8.4,
      h: 4.2,
      fontSize: 16,
      color: colors.text,
      fontFace: fonts.body,
      bullet: true,
      lineSpacingMultiple: 1.4,
    });
  }
  if (slide.notes) s.addNotes(slide.notes);
}

/**
 * 依据美化内容 + 主题生成 .pptx 二进制。
 * 幻灯片顺序 = content.slides 顺序；演讲备注写入 notes。
 */
export async function buildPptx(content: PptContent, theme: PptTheme): Promise<Buffer> {
  // 动态导入 pptxgenjs：tsx 运行时下静态默认导入会得到非构造函数（vitest / node ESM 下两种写法均正常）
  const { default: PptxGenJSCtor } = await import('pptxgenjs');
  const pptx = new PptxGenJSCtor();
  pptx.defineLayout({
    name: theme.slideSize === '16:9' ? 'W16x9' : 'W4x3',
    width: theme.slideSize === '16:9' ? 10 : 10,
    height: theme.slideSize === '16:9' ? 5.625 : 7.5,
  });
  pptx.layout = theme.slideSize === '16:9' ? 'W16x9' : 'W4x3';
  pptx.title = content.deckTitle;

  // 封面资产一次解析：配置了 assetBasePath 时拼接目录前缀，否则按原始路径读取
  const assetName = theme.assets?.coverImagePath ?? theme.assets?.backgroundPath;
  const coverImg = await toDataUri(
    assetName ? (theme.assetBasePath ? join(theme.assetBasePath, assetName) : assetName) : undefined
  );

  for (const slide of content.slides) {
    renderSlide(pptx, slide, theme, slide.pageType === 'cover' ? coverImg : undefined);
  }

  const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return out;
}
