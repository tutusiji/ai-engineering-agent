/** PPT 页面类型 — 覆盖 v1 支持的全部 7 种版式 */
export type PptPageType = 'cover' | 'toc' | 'section' | 'content-bullets' | 'content-two-col' | 'quote' | 'ending';

/** 版面密度 — 决定每页字数预算 */
export type PptLayoutDensity = 'compact' | 'standard' | 'spacious';

/** 单页字数预算：标题最大字数 / 要点条数上限 / 单条要点字数上限 */
export interface SlideBudget {
  titleMax: number;
  bulletCount: number;
  bulletChars: number;
}

/** 主题色板 — 预设主题与模板提取结果同构 */
export interface PptThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  accent: string;
}

/** 主题字体（字体族名，带回退栈由渲染层处理） */
export interface PptThemeFonts {
  title: string;
  body: string;
}

/** 主题资产（相对 assetBasePath 的文件名） */
export interface PptThemeAssets {
  logoPath?: string;
  backgroundPath?: string;
  coverImagePath?: string;
}

/** PPT 主题 — skill 提示词与 pptx 渲染共用的唯一事实来源 */
export interface PptTheme {
  name: string;
  mode: 'preset' | 'extracted';
  colors: PptThemeColors;
  fonts: PptThemeFonts;
  assets?: PptThemeAssets;
  slideSize: '16:9' | '4:3';
  layoutDensity: PptLayoutDensity;
  /** 运行时字段：资产文件的目录前缀（不入合约/DB，由 API 层注入） */
  assetBasePath?: string;
}
