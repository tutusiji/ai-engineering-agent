import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { PptTheme, PptThemeAssets } from './types.js';

/** 模板解析结果：主题 JSON + 提取出的媒体资产（键为 ppt/media/ 下文件名） */
export interface ParsedTemplate {
  theme: PptTheme;
  assets: Record<string, Buffer>;
}

/** OOXML 颜色元素名 → 主题色板槽位映射 */
const COLOR_SLOT_MAP: Record<string, keyof PptTheme['colors']> = {
  'a:accent1': 'primary',
  'a:accent2': 'secondary',
  'a:lt1': 'background',
  'a:lt2': 'surface',
  'a:dk1': 'text',
  'a:dk2': 'text', // dk2 无对应槽位，并入 text 兜底（实际取值以 dk1 优先）
};

/** Office 默认主题色（命中时认为模板未定制配色，走页面用色频次统计兜底） */
const OFFICE_DEFAULT_ACCENT1 = '4472C4';

/** 校验并规范化 6 位十六进制颜色值（OOXML srgbClr val；非法输入返回 undefined） */
function normalizeColor(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined;
  const hex = val.replace('#', '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(hex) ? hex : undefined;
}

/**
 * 解析 .pptx 模板 → 主题 JSON + 媒体资产。
 * v1 主题提取策略：
 * - 配色：theme1.xml clrScheme；若 accent1 仍是 Office 默认色则统计各页实际用色取高频色兜底
 * - 字体：theme1.xml fontScheme 的 majorFont/minorFont
 * - 画幅：presentation.xml sldSz（宽高比 ≥1.7 → 16:9，否则 4:3）
 * - 资产：ppt/media/ 全部图片；最大图片（≥30KB）作为背景，被母版引用的作为 logo
 */
export async function parseTemplate(filePath: string): Promise<ParsedTemplate> {
  const raw = await readFile(filePath);
  const zip = await JSZip.loadAsync(raw);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  // ── 1. 配色 + 字体：ppt/theme/theme1.xml ──
  const themeFile = zip.file('ppt/theme/theme1.xml');
  if (!themeFile) {
    throw new Error('无效的 .pptx 模板：缺少 ppt/theme/theme1.xml（仅支持未加密的 OOXML 格式）');
  }
  const themeXml = await themeFile.async('string');
  const themeObj = parser.parse(themeXml);
  const clrScheme = themeObj?.['a:theme']?.['a:themeElements']?.['a:clrScheme'] ?? {};
  const fontScheme = themeObj?.['a:theme']?.['a:themeElements']?.['a:fontScheme'] ?? {};

  const colors: Record<string, string> = {};
  for (const [tag, slot] of Object.entries(COLOR_SLOT_MAP) as [string, keyof PptTheme['colors']][]) {
    const node = (clrScheme as Record<string, unknown>)[tag] as Record<string, unknown> | undefined;
    const srgb = node?.['a:srgbClr'] as Record<string, unknown> | undefined;
    const sys = node?.['a:sysClr'] as Record<string, unknown> | undefined;
    const hex = normalizeColor(srgb?.['@_val']) ?? normalizeColor(sys?.['@_lastClr']);
    if (hex && !(slot in colors)) colors[slot] = hex;
  }

  // ── 2. Office 默认配色兜底：统计各页实际用色频次 ──
  if (colors.primary === OFFICE_DEFAULT_ACCENT1) {
    const freq = new Map<string, number>();
    const slideEntries = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    for (const name of slideEntries) {
      const xml = await zip.file(name)!.async('string');
      for (const m of xml.matchAll(/srgbClr val="([0-9A-Fa-f]{6})"/g)) {
        const hex = m[1].toUpperCase();
        // 中性色（黑/白/灰阶）不计入主色统计
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
        const isNeutral = Math.max(r, g, b) - Math.min(r, g, b) < 24;
        if (!isNeutral) freq.set(hex, (freq.get(hex) ?? 0) + 1);
      }
    }
    if (freq.size > 0) {
      const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
      colors.primary = sorted[0][0];
      if (sorted[1]) colors.secondary = sorted[1][0];
    }
  }

  // ── 3. 字体 ──
  const major = (fontScheme['a:majorFont'] as Record<string, unknown> | undefined)?.['a:latin'] as
    | Record<string, unknown>
    | undefined;
  const minor = (fontScheme['a:minorFont'] as Record<string, unknown> | undefined)?.['a:latin'] as
    | Record<string, unknown>
    | undefined;
  const titleFont = String(major?.['@_typeface'] ?? 'Arial');
  const bodyFont = String(minor?.['@_typeface'] ?? 'Arial');

  // ── 4. 画幅比例 ──
  const presXml = await zip.file('ppt/presentation.xml')!.async('string');
  const presObj = parser.parse(presXml);
  const sldSz = presObj?.['p:presentation']?.['p:sldSz'] ?? {};
  const cx = Number(sldSz['@_cx'] ?? 12192000);
  const cy = Number(sldSz['@_cy'] ?? 6858000);
  const slideSize: '16:9' | '4:3' = cx / cy >= 1.7 ? '16:9' : '4:3';

  // ── 5. 媒体资产 ──
  const assets: Record<string, Buffer> = {};
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith('ppt/media/')) continue;
    const file = zip.file(name);
    if (!file) continue; // 目录条目（如 'ppt/media/'）在 zip.file() 下返回 null
    const buf = await file.async('nodebuffer');
    if (buf.length === 0) continue;
    assets[path.basename(name)] = buf;
  }

  // 背景图 = 最大的栅格图片（≥30KB）— 仅接受图片扩展名，视频/WMF 等媒体误选会产出损坏封面
  const themeAssets: PptThemeAssets = {};
  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp']);
  const largest = Object.entries(assets)
    .filter(([name]) => IMAGE_EXTS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => b[1].length - a[1].length)[0];
  if (largest && largest[1].length >= 30 * 1024) {
    themeAssets.backgroundPath = largest[0];
  }

  // logo = 母版 rels 引用的图片（取第一个存在于 assets 的图片关系）
  const masterRelsFile = zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels');
  if (masterRelsFile) {
    const relsObj = parser.parse(await masterRelsFile.async('string'));
    const relNode: unknown = relsObj?.['Relationships']?.['Relationship'];
    const relList: unknown[] = Array.isArray(relNode) ? relNode : relNode != null ? [relNode] : [];
    for (const rel of relList) {
      const attrs = (rel ?? {}) as Record<string, unknown>;
      const relType = attrs['@_Type'];
      const target = attrs['@_Target'];
      if (typeof relType === 'string' && relType.includes('/image') && typeof target === 'string') {
        const base = path.basename(target);
        if (assets[base]) {
          themeAssets.logoPath = base;
          break;
        }
      }
    }
  }

  return {
    theme: {
      name: path.basename(filePath, path.extname(filePath)),
      mode: 'extracted',
      colors: {
        primary: colors.primary ?? '1D4ED8',
        secondary: colors.secondary ?? '3B82F6',
        background: colors.background ?? 'FFFFFF',
        surface: colors.surface ?? 'EFF6FF',
        text: colors.text ?? '0F172A',
        accent: colors.accent ?? 'F59E0B',
      },
      fonts: { title: titleFont, body: bodyFont },
      assets: themeAssets,
      slideSize,
      layoutDensity: 'standard',
    },
    assets,
  };
}
