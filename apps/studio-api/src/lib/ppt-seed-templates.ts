/**
 * ppt-seed-templates — 内置主题种子清单
 *
 * 六套带封面背景的内置主题：背景图由 scripts/generate-ppt-seed-backgrounds.py
 * 程序化原创绘制（无第三方素材，无版权负担）。启动时由 seedBuiltinPptTemplates
 * 幂等注入：行缺失则入库（source='builtin'，全员可见），资产文件落 ArtifactStore。
 *
 * 约定：
 * - id 必须登记进 persistence 的 BUILTIN_PPT_TEMPLATE_IDS（themeId 注入白名单）
 * - colors 不带 # 前缀（与迁移 002 的种子行一致）
 * - theme 不得携带 assetBasePath（运行时由 plugin-runner 按 themeId 注入，不入库）
 */

import type { PptTheme } from '@ai-engineering-agent/pptx-core';

/** 资产源文件所在目录（相对仓库根） */
export const PPT_SEED_ASSET_DIR = 'apps/studio-api/assets/ppt-seeds';

/** 内置种子主题清单项 */
export interface SeedPptTemplate {
  /** 固定语义 id（需在 BUILTIN_PPT_TEMPLATE_IDS 白名单内） */
  id: string;
  /** 选择器展示名 */
  name: string;
  /** 主题 JSON（无 assetBasePath） */
  theme: PptTheme;
  /** 资产名 -> 仓库内源文件相对路径（种子例程据此落盘） */
  assetFiles: Record<string, string>;
}

/** 内置完整版式模板文件清单项 */
export interface SeedPptTemplateFile {
  /** 固定语义 id（tpl- 前缀，需在 BUILTIN_PPT_TEMPLATE_IDS 白名单内） */
  id: string;
  /** 选择器展示名 */
  name: string;
  /** .pptx 源文件相对仓库根路径 */
  file: string;
}

/**
 * 内置完整版式模板文件清单（.pptx 原件）。
 * 每套 4 页整页背景（页 1 封面 / 2 章节 / 3 内容 / 4 结尾），由
 * scripts/build-ppt-seed-templates.py 组装；启动时走 parseTemplate 提取入库，
 * 与用户上传链路完全同构（theme JSON 不手工维护）。
 */
export const SEED_PPT_TEMPLATE_FILES: readonly SeedPptTemplateFile[] = [
  { id: 'tpl-luxe-indigo', name: '轻奢靛蓝 · 完整版式', file: `${PPT_SEED_ASSET_DIR}/tpl-luxe-indigo.pptx` },
  { id: 'tpl-champagne-gold', name: '暖沙鎏金 · 完整版式', file: `${PPT_SEED_ASSET_DIR}/tpl-champagne-gold.pptx` },
  { id: 'tpl-jade-night', name: '墨玉暗夜 · 完整版式', file: `${PPT_SEED_ASSET_DIR}/tpl-jade-night.pptx` },
  { id: 'tpl-mist-blue', name: '晨雾蓝白 · 完整版式', file: `${PPT_SEED_ASSET_DIR}/tpl-mist-blue.pptx` },
];

export const SEED_PPT_TEMPLATES: readonly SeedPptTemplate[] = [
  {
    id: 'theme-luxe-indigo',
    name: '轻奢靛蓝',
    theme: {
      name: '轻奢靛蓝',
      mode: 'preset',
      colors: {
        primary: '4F46E5',
        secondary: '8B5CF6',
        background: 'FAF9F6',
        surface: 'EEF2FF',
        text: '1E1B4B',
        accent: 'D4AF37',
      },
      fonts: { title: 'Microsoft YaHei', body: 'Microsoft YaHei' },
      assets: { backgroundPath: 'background.jpg' },
      slideSize: '16:9',
      layoutDensity: 'standard',
    },
    assetFiles: { 'background.jpg': `${PPT_SEED_ASSET_DIR}/luxe-indigo.jpg` },
  },
  {
    id: 'theme-champagne-gold',
    name: '暖沙鎏金',
    theme: {
      name: '暖沙鎏金',
      mode: 'preset',
      colors: {
        primary: 'A16207',
        secondary: 'CA8A04',
        background: 'FDFBF6',
        surface: 'FAF3E0',
        text: '292524',
        accent: '0E7490',
      },
      fonts: { title: 'Microsoft YaHei', body: 'Microsoft YaHei' },
      assets: { backgroundPath: 'background.jpg' },
      slideSize: '16:9',
      layoutDensity: 'standard',
    },
    assetFiles: { 'background.jpg': `${PPT_SEED_ASSET_DIR}/champagne-gold.jpg` },
  },
  {
    id: 'theme-jade-night',
    name: '墨玉暗夜',
    theme: {
      name: '墨玉暗夜',
      mode: 'preset',
      colors: {
        primary: '34D399',
        secondary: '2DD4BF',
        background: '0A0F0D',
        surface: '12201A',
        text: 'E7F6EF',
        accent: 'FBBF24',
      },
      fonts: { title: 'Microsoft YaHei', body: 'Microsoft YaHei' },
      assets: { backgroundPath: 'background.jpg' },
      slideSize: '16:9',
      layoutDensity: 'standard',
    },
    assetFiles: { 'background.jpg': `${PPT_SEED_ASSET_DIR}/jade-night.jpg` },
  },
  {
    id: 'theme-mist-blue',
    name: '晨雾蓝白',
    theme: {
      name: '晨雾蓝白',
      mode: 'preset',
      colors: {
        primary: '0369A1',
        secondary: '38BDF8',
        background: 'FFFFFF',
        surface: 'F0F9FF',
        text: '0C4A6E',
        accent: '059669',
      },
      fonts: { title: 'Microsoft YaHei', body: 'Microsoft YaHei' },
      assets: { backgroundPath: 'background.jpg' },
      slideSize: '16:9',
      layoutDensity: 'standard',
    },
    assetFiles: { 'background.jpg': `${PPT_SEED_ASSET_DIR}/mist-blue.jpg` },
  },
  {
    id: 'theme-forest-sage',
    name: '森语绿意',
    theme: {
      name: '森语绿意',
      mode: 'preset',
      colors: {
        primary: '166534',
        secondary: '65A30D',
        background: 'F5F8EF',
        surface: 'E7EFD9',
        text: '14261B',
        accent: 'D97706',
      },
      fonts: { title: 'Microsoft YaHei', body: 'Microsoft YaHei' },
      assets: { backgroundPath: 'background.jpg' },
      slideSize: '16:9',
      layoutDensity: 'standard',
    },
    assetFiles: { 'background.jpg': `${PPT_SEED_ASSET_DIR}/forest-sage.jpg` },
  },
  {
    id: 'theme-violet-dusk',
    name: '绛紫晚霞',
    theme: {
      name: '绛紫晚霞',
      mode: 'preset',
      colors: {
        primary: 'C084FC',
        secondary: 'F472B6',
        background: '150B28',
        surface: '2A1745',
        text: 'F5EFFF',
        accent: 'F2C46B',
      },
      fonts: { title: 'Microsoft YaHei', body: 'Microsoft YaHei' },
      assets: { backgroundPath: 'background.jpg' },
      slideSize: '16:9',
      layoutDensity: 'standard',
    },
    assetFiles: { 'background.jpg': `${PPT_SEED_ASSET_DIR}/violet-dusk.jpg` },
  },
];
