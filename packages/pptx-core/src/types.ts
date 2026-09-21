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
  /** 章节页整页背景（多页型模板：.pptx 第 2 页提取） */
  sectionImagePath?: string;
  /** 内容页整页背景（多页型模板：第 3 页提取，toc/content/quote 共用） */
  contentImagePath?: string;
  /** 结尾页整页背景（多页型模板：第 4 页提取） */
  endingImagePath?: string;
}

/** PPT 内容单页 — pageType 决定版式，polished* 为润色后要渲染的文本 */
export interface PptContentSlide {
  /** 页码（1 起） */
  pageNo: number;
  /** 页面类型（7 种版式之一） */
  pageType: PptPageType;
  /** 原始标题 */
  title: string;
  /** 润色后的标题（渲染使用） */
  polishedTitle: string;
  /** 原始要点 */
  bullets?: string[];
  /** 润色后的要点（渲染使用） */
  polishedBullets?: string[];
  /** 金句/钩子行（quote 页正文或内容页标题栏右侧强调） */
  hookLine?: string;
  /** 演讲者备注 */
  notes?: string;
}

/** PPT 全文内容 — buildPptx 的渲染输入 */
export interface PptContent {
  /** 演示文稿标题（写入元数据与封面标题） */
  deckTitle: string;
  /** 副标题 */
  subtitle?: string;
  /** 目标受众 */
  audience?: string;
  /** 幻灯片列表，顺序即生成顺序 */
  slides: PptContentSlide[];
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
