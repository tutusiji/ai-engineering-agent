// 类型仅作标注用（type 导入在运行时被擦除）；运行时改为 buildPptx 内动态导入，以兼容 tsx 运行时
// （tsx 下对 pptxgenjs 的静态默认导入会得到非构造函数对象，详见 task-3 报告）
import type PptxGenJS from 'pptxgenjs';
import { resolve, sep } from 'node:path';
import type { PptContent, PptContentSlide } from './types.js';
import type { PptTheme } from './types.js';

/**
 * 解析资产文件为 data URI（图片以 base64 内嵌，避免文件路径问题）
 * MIME 按扩展名推断（默认 png）—— JPEG 字节误标为 image/png 会被 PowerPoint 判定需修复或渲染失败
 */
async function toDataUri(path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  const { readFile, } = await import('node:fs/promises');
  try {
    const buf = await readFile(path);
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return undefined; // 资产缺失时静默降级为纯色版式
  }
}

/**
 * 拼接资产绝对路径并做目录闭合校验 — 资产读取的最后一道闸（闸 B）。
 * join/resolve 的归一化可被 assetName 携带的 '../' 折叠逃逸出资产目录（纵深防御：闸 A 已保证
 * assetBasePath 为服务端派生，此处兜底防文件名穿越），故 resolve 后校验落点仍在 assetBasePath
 * 内（含目录本身）；越界不抛错，返回 undefined 复用 toDataUri 的静默降级语义（纯色版式）
 * @param assetBasePath 资产根目录（服务端按 themeId 派生注入）
 * @param assetName 资产文件名（theme JSON 内的相对名，不可信）
 * @returns 闭合校验通过的绝对路径；越界返回 undefined
 */
function resolveConfinedAssetPath(assetBasePath: string, assetName: string): string | undefined {
  const base = resolve(assetBasePath);
  const resolved = resolve(base, assetName);
  if (resolved === base || resolved.startsWith(base + sep)) {
    return resolved;
  }
  return undefined;
}

/**
 * 将字符串数组转为 pptxgenjs 的 TextProps[]（v4 的 addText 不接受裸字符串数组）。
 * 每项携带 breakLine: true 确保逐项分段 —— 否则多项会被合并进单个 <a:p>（pptxgenjs 仅在
 * 项间存在 bullet/align 变化/breakLine 时切分段落）。withBullet 为 true 时逐项携带项目符号：
 * bullet 继承只作用于首项，后续段落必须自带才会渲染符号。
 */
function toTextProps(items: string[], withBullet = false): PptxGenJS.TextProps[] {
  return items.map((text) => ({
    text,
    options: withBullet ? { bullet: true, breakLine: true } : { breakLine: true },
  }));
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
    // bullet 页逐项携带项目符号（调用级的 bullet: true 只影响首项，见 toTextProps 注释）
    s.addText(toTextProps(bullets, true), {
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
    // 宽固定 10 英寸，4:3 仅高度不同
    width: 10,
    height: theme.slideSize === '16:9' ? 5.625 : 7.5,
  });
  pptx.layout = theme.slideSize === '16:9' ? 'W16x9' : 'W4x3';
  pptx.title = content.deckTitle;

  // 封面资产解析：仅当 assetBasePath 存在时经闭合校验拼接读取；缺省一律纯色兜底，
  // 不做无前缀的原始路径读取（防 coverImagePath 携带 cwd 相对/绝对路径直读任意文件）
  const assetName = theme.assets?.coverImagePath ?? theme.assets?.backgroundPath;
  const coverImg = await toDataUri(
    assetName && theme.assetBasePath ? resolveConfinedAssetPath(theme.assetBasePath, assetName) : undefined
  );

  for (const slide of content.slides) {
    renderSlide(pptx, slide, theme, slide.pageType === 'cover' ? coverImg : undefined);
  }

  const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return out;
}
