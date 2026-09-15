# PPT 生成功能实施计划（v1 主题提取式）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ai-engineering-agent 平台新增「内容 → 大纲（审批）→ 美化 → .pptx」的 PPT 生成工作流，支持内置主题（可复制微调）与上传 .pptx 模板（主题提取式）。

**Architecture:** 完全复用平台既有范式：2 个 Skill（agent-runtime）+ 2 个 plugin + 1 个核心库（pptx-core）+ 1 条 workflow YAML（workflow-core DAG，含大纲审批闸门）+ 4 个 contracts + persistence 新表 + studio-web 新面板。主题与模板提取结果同构为 ppt-theme JSON，生成端单一代码路径。

**Tech Stack:** TypeScript (ESM) / pptxgenjs（生成）/ JSZip + fast-xml-parser（模板解析）/ mammoth + pdf-parse（文档解析）/ vitest（测试）/ React 18 + Tailwind（前端）

**Spec:** `docs/superpowers/specs/2026-09-14-ppt-generation-design.md`（实施前必读）

## 与 spec 的两处实现简化（有意的偏离，已获认可方向）

1. **主题解析前移 + 工作流拆分两段**：spec §8 的 `POST /api/ppt/generate` 不单独建端点——`GET /api/ppt/themes` 直接返回含完整 theme JSON 的主题列表，前端选中后调用工作流 run 端点。工作流输入字段为 `theme`（已解析的完整 JSON），而非 spec §7 的 `themeRef`。另因 executor 审批闸门为非阻断（无暂停/恢复机制，见 Task 8），spec §7 的单工作流 `from-content-to-ppt` 拆为 `ppt-outline` 与 `ppt-build` 两条工作流，大纲审批/编辑/精炼由前端在两次 run 之间承载（详见 Task 8 开头说明）。
2. **模板上传用 base64 JSON**（`POST /api/ppt/templates` body: `{ name, fileBase64 }`），不引入 multer；该路由单独挂 `express.json({ limit: '20mb' })`。

## Global Constraints

- 所有函数/类/方法/类型必须使用**中文注释**（JSDoc + 行内）
- 所有 Git 提交信息使用**中文**，格式 `<类型>: <描述>`，结尾加 `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- 禁止 `any`，未知类型用 `unknown`；参数与返回值显式标注类型
- 文件/目录 kebab-case；类型 PascalCase；函数 camelCase；常量 UPPER_SNAKE_CASE
- 前端必须处理 loading/empty/error 状态；生成按钮提交时 disabled 防重复；删除模板需二次确认
- 包管理 pnpm workspace；新包 `type: "module"`；workspace 依赖用 `workspace:*`
- 每个任务结束跑根目录 `pnpm typecheck` + 该包测试，全绿才提交
- 测试框架 vitest（仓库既有约定，per-package devDependency）

---

### Task 1: 4 个合约 Schema

**Files:**

- Create: `contracts/ppt-source.schema.json`
- Create: `contracts/ppt-outline.schema.json`
- Create: `contracts/ppt-theme.schema.json`
- Create: `contracts/ppt-content.schema.json`
- Test: `packages/contract-schema/src/__tests__/ppt-contracts.test.ts`

**Interfaces:**

- Produces: 4 个按文件名约定加载的 schema（`FileSchemaRegistry.get({name:'ppt-source'})` 等可直接命中），供 Task 5 skill、Task 6/7 plugin 的 `outputSchema`/`inputSchema` 引用。
- 平台合约校验只检查顶层 `required` 字段（见 `packages/contract-schema/src/index.ts` 的 `validate`），schema 文件里 `required` 必须与下述字段完全一致。

- [ ] **Step 1: 写失败测试**

```typescript
// packages/contract-schema/src/__tests__/ppt-contracts.test.ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { FileSchemaRegistry } from '../index.js';

// 合约目录指向仓库根 contracts/
const CONTRACTS_DIR = path.resolve(__dirname, '../../../../contracts');
const registry = new FileSchemaRegistry({ contractsDir: CONTRACTS_DIR });

describe('PPT 合约 schema', () => {
  it('ppt-source：要求 sourceType/markdown 必填，并通过 validate', async () => {
    const schema = await registry.get({ name: 'ppt-source' } as never);
    expect(schema).toBeDefined();
    expect((schema as Record<string, unknown>).required).toEqual(['sourceType', 'markdown']);
    const ok = await registry.validate({ name: 'ppt-source' } as never, {
      sourceType: 'paste',
      markdown: '# 内容',
      meta: { wordCount: 3 },
    });
    expect(ok.valid).toBe(true);
  });

  it('ppt-outline：要求 deckTitle/totalPages/slides 必填', async () => {
    const schema = await registry.get({ name: 'ppt-outline' } as never);
    expect((schema as Record<string, unknown>).required).toEqual(['deckTitle', 'totalPages', 'slides']);
  });

  it('ppt-theme：要求 name/mode/colors/fonts/slideSize/layoutDensity 必填', async () => {
    const schema = await registry.get({ name: 'ppt-theme' } as never);
    expect((schema as Record<string, unknown>).required).toEqual([
      'name',
      'mode',
      'colors',
      'fonts',
      'slideSize',
      'layoutDensity',
    ]);
  });

  it('ppt-content：要求 deckTitle/slides 必填', async () => {
    const schema = await registry.get({ name: 'ppt-content' } as never);
    expect((schema as Record<string, unknown>).required).toEqual(['deckTitle', 'slides']);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @ai-engineering-agent/contract-schema test`
Expected: FAIL（4 个用例均因 schema 不存在而失败）。若该包尚无 vitest：`pnpm --filter @ai-engineering-agent/contract-schema add -D vitest`，并在 package.json 加 `"test": "vitest"`。

- [ ] **Step 3: 写 4 个 schema 文件**

```json
// contracts/ppt-source.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PptSource",
  "type": "object",
  "required": ["sourceType", "markdown"],
  "properties": {
    "sourceType": { "type": "string", "enum": ["paste", "file", "platform-project"] },
    "markdown": { "type": "string" },
    "meta": {
      "type": "object",
      "properties": {
        "fileName": { "type": "string" },
        "projectRunId": { "type": "string" },
        "wordCount": { "type": "number" },
        "warnings": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

```json
// contracts/ppt-outline.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PptOutline",
  "type": "object",
  "required": ["deckTitle", "totalPages", "slides"],
  "properties": {
    "deckTitle": { "type": "string" },
    "subtitle": { "type": "string" },
    "audience": { "type": "string" },
    "totalPages": { "type": "number" },
    "slides": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["pageNo", "pageType", "title"],
        "properties": {
          "pageNo": { "type": "number" },
          "pageType": {
            "type": "string",
            "enum": ["cover", "toc", "section", "content-bullets", "content-two-col", "quote", "ending"]
          },
          "title": { "type": "string" },
          "bullets": { "type": "array", "items": { "type": "string" } },
          "notes": { "type": "string" }
        }
      }
    }
  }
}
```

```json
// contracts/ppt-theme.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PptTheme",
  "type": "object",
  "required": ["name", "mode", "colors", "fonts", "slideSize", "layoutDensity"],
  "properties": {
    "name": { "type": "string" },
    "mode": { "type": "string", "enum": ["preset", "extracted"] },
    "colors": {
      "type": "object",
      "required": ["primary", "secondary", "background", "surface", "text", "accent"],
      "properties": {
        "primary": { "type": "string" },
        "secondary": { "type": "string" },
        "background": { "type": "string" },
        "surface": { "type": "string" },
        "text": { "type": "string" },
        "accent": { "type": "string" }
      }
    },
    "fonts": {
      "type": "object",
      "required": ["title", "body"],
      "properties": { "title": { "type": "string" }, "body": { "type": "string" } }
    },
    "assets": {
      "type": "object",
      "properties": {
        "logoPath": { "type": "string" },
        "backgroundPath": { "type": "string" },
        "coverImagePath": { "type": "string" }
      }
    },
    "slideSize": { "type": "string", "enum": ["16:9", "4:3"] },
    "layoutDensity": { "type": "string", "enum": ["compact", "standard", "spacious"] }
  }
}
```

```json
// contracts/ppt-content.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PptContent",
  "type": "object",
  "required": ["deckTitle", "slides"],
  "properties": {
    "deckTitle": { "type": "string" },
    "subtitle": { "type": "string" },
    "audience": { "type": "string" },
    "slides": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["pageNo", "pageType", "polishedTitle"],
        "properties": {
          "pageNo": { "type": "number" },
          "pageType": {
            "type": "string",
            "enum": ["cover", "toc", "section", "content-bullets", "content-two-col", "quote", "ending"]
          },
          "title": { "type": "string" },
          "polishedTitle": { "type": "string" },
          "bullets": { "type": "array", "items": { "type": "string" } },
          "polishedBullets": { "type": "array", "items": { "type": "string" } },
          "hookLine": { "type": "string" },
          "notes": { "type": "string" },
          "fitting": {
            "type": "object",
            "properties": {
              "warnings": { "type": "array", "items": { "type": "string" } }
            }
          }
        }
      }
    }
  }
}
```

- [ ] **Step 4: 运行测试通过**

Run: `pnpm --filter @ai-engineering-agent/contract-schema test`
Expected: PASS（4 用例）

- [ ] **Step 5: 提交**

```bash
git add contracts/ppt-*.schema.json packages/contract-schema
git commit -m "feat: 新增 PPT 生成 4 个合约 schema（ppt-source/outline/theme/content）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: pptx-core 包骨架 + 字数预算表

**Files:**

- Create: `packages/pptx-core/package.json`
- Create: `packages/pptx-core/src/types.ts`
- Create: `packages/pptx-core/src/budget.ts`
- Create: `packages/pptx-core/src/index.ts`
- Test: `packages/pptx-core/src/__tests__/budget.test.ts`

**Interfaces:**

- Produces（后续所有任务依赖，名称逐字使用）:
  - `type PptPageType = 'cover'|'toc'|'section'|'content-bullets'|'content-two-col'|'quote'|'ending'`
  - `type PptLayoutDensity = 'compact'|'standard'|'spacious'`
  - `interface SlideBudget { titleMax: number; bulletCount: number; bulletChars: number }`
  - `interface PptTheme { name: string; mode: 'preset'|'extracted'; colors: {primary;secondary;background;surface;text;accent: string}; fonts: {title: string; body: string}; assets?: {logoPath?;backgroundPath?;coverImagePath?: string}; slideSize: '16:9'|'4:3'; layoutDensity: PptLayoutDensity; assetBasePath?: string }`
  - `getSlideBudget(pageType: PptPageType, density: PptLayoutDensity): SlideBudget`

- [ ] **Step 1: 创建包**

```json
// packages/pptx-core/package.json
{
  "name": "@ai-engineering-agent/pptx-core",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.js" },
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest" },
  "dependencies": {
    "fast-xml-parser": "^5.2.5",
    "jszip": "^3.10.1",
    "pptxgenjs": "^4.0.1"
  },
  "devDependencies": { "@types/node": "^25.6.0", "vitest": "^4.1.9" }
}
```

Run: `pnpm install`（workspace 链接）。

```typescript
// packages/pptx-core/src/types.ts
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
```

```typescript
// packages/pptx-core/src/index.ts
export * from './types.js';
export * from './budget.js';
```

- [ ] **Step 2: 写失败测试**

```typescript
// packages/pptx-core/src/__tests__/budget.test.ts
import { describe, it, expect } from 'vitest';
import { getSlideBudget } from '../budget.js';

describe('getSlideBudget 字数预算表', () => {
  it('content-bullets + standard = 5 条 × 18 字，标题 12 字', () => {
    expect(getSlideBudget('content-bullets', 'standard')).toEqual({
      titleMax: 12,
      bulletCount: 5,
      bulletChars: 18,
    });
  });

  it('compact 密度：条数 ×1.3、单条字数 ×0.85', () => {
    expect(getSlideBudget('content-bullets', 'compact')).toEqual({
      titleMax: 12,
      bulletCount: 7,
      bulletChars: 15,
    });
  });

  it('spacious 密度：条数 ×0.8、单条字数 ×1.15', () => {
    expect(getSlideBudget('content-bullets', 'spacious')).toEqual({
      titleMax: 12,
      bulletCount: 4,
      bulletChars: 21,
    });
  });

  it('cover / ending 页无要点（bulletCount 恒为 0）', () => {
    expect(getSlideBudget('cover', 'compact').bulletCount).toBe(0);
    expect(getSlideBudget('ending', 'spacious').bulletCount).toBe(0);
  });

  it('quote 页允许长句（60 字金句）', () => {
    expect(getSlideBudget('quote', 'standard')).toEqual({
      titleMax: 30,
      bulletCount: 1,
      bulletChars: 60,
    });
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm --filter @ai-engineering-agent/pptx-core test`
Expected: FAIL（budget.ts 不存在）

- [ ] **Step 4: 实现 budget.ts**

```typescript
// packages/pptx-core/src/budget.ts
import type { PptLayoutDensity, PptPageType, SlideBudget } from './types.js';

/** standard 密度下的基础预算表（单一事实来源：skill prompt 与 buildPptx 共用） */
const BASE_BUDGET: Record<PptPageType, SlideBudget> = {
  cover: { titleMax: 20, bulletCount: 0, bulletChars: 0 },
  toc: { titleMax: 12, bulletCount: 6, bulletChars: 16 },
  section: { titleMax: 16, bulletCount: 1, bulletChars: 40 },
  'content-bullets': { titleMax: 12, bulletCount: 5, bulletChars: 18 },
  'content-two-col': { titleMax: 12, bulletCount: 8, bulletChars: 14 },
  quote: { titleMax: 30, bulletCount: 1, bulletChars: 60 },
  ending: { titleMax: 20, bulletCount: 0, bulletChars: 0 },
};

/** 密度修正系数：compact 更密（条多字短），spacious 更疏（条少字长） */
const DENSITY_MODIFIERS: Record<PptLayoutDensity, { countMul: number; charsMul: number }> = {
  compact: { countMul: 1.3, charsMul: 0.85 },
  standard: { countMul: 1, charsMul: 1 },
  spacious: { countMul: 0.8, charsMul: 1.15 },
};

/**
 * 查询某页面类型在指定密度下的字数预算。
 * 封面/结尾页要点恒为 0（不受密度影响）。
 */
export function getSlideBudget(pageType: PptPageType, density: PptLayoutDensity): SlideBudget {
  const base = BASE_BUDGET[pageType];
  const mod = DENSITY_MODIFIERS[density];
  if (base.bulletCount === 0) {
    return { titleMax: base.titleMax, bulletCount: 0, bulletChars: 0 };
  }
  return {
    titleMax: base.titleMax,
    bulletCount: Math.max(1, Math.round(base.bulletCount * mod.countMul)),
    bulletChars: Math.max(1, Math.round(base.bulletChars * mod.charsMul)),
  };
}
```

- [ ] **Step 5: 运行测试通过 + typecheck**

Run: `pnpm --filter @ai-engineering-agent/pptx-core test && pnpm typecheck`
Expected: PASS；typecheck 无错误（若 pptx-core 不在根 tsconfig 引用范围，按 `tsconfig.base.json` 里其他 packages 的 references/paths 模式补上——先查看再仿照）。

- [ ] **Step 6: 提交**

```bash
git add packages/pptx-core pnpm-lock.yaml
git commit -m "feat: 新增 pptx-core 包与字数预算表（skill 与渲染共用）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: pptx-core buildPptx（7 种版式渲染器）

**Files:**

- Create: `packages/pptx-core/src/build.ts`
- Modify: `packages/pptx-core/src/index.ts`（追加导出）
- Test: `packages/pptx-core/src/__tests__/build.test.ts`

**Interfaces:**

- Consumes: Task 2 的 `PptTheme` / `getSlideBudget`
- Produces:
  - `interface PptContentSlide { pageNo: number; pageType: PptPageType; title: string; polishedTitle: string; bullets?: string[]; polishedBullets?: string[]; hookLine?: string; notes?: string }`
  - `interface PptContent { deckTitle: string; subtitle?: string; audience?: string; slides: PptContentSlide[] }`
  - `buildPptx(content: PptContent, theme: PptTheme): Promise<Buffer>`

- [ ] **Step 1: 写失败测试**

```typescript
// packages/pptx-core/src/__tests__/build.test.ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @ai-engineering-agent/pptx-core test`
Expected: FAIL（build.ts 不存在）

- [ ] **Step 3: 实现 build.ts**

```typescript
// packages/pptx-core/src/build.ts
import PptxGenJS from 'pptxgenjs';
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
    s.addText(slide.polishedBullets ?? [], {
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
    s.addText(bullets.slice(0, mid), {
      x: 0.6,
      y: 1.4,
      w: 4.2,
      h: 4.2,
      fontSize: 15,
      color: colors.text,
      fontFace: fonts.body,
      lineSpacingMultiple: 1.35,
    });
    s.addText(bullets.slice(mid), {
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
    s.addText(bullets, {
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
  const pptx = new PptxGenJS();
  pptx.defineLayout({
    name: theme.slideSize === '16:9' ? 'W16x9' : 'W4x3',
    width: theme.slideSize === '16:9' ? 10 : 10,
    height: theme.slideSize === '16:9' ? 5.625 : 7.5,
  });
  pptx.layout = theme.slideSize === '16:9' ? 'W16x9' : 'W4x3';
  pptx.title = content.deckTitle;

  const coverImg = await toDataUri(theme.assets?.coverImagePath ?? theme.assets?.backgroundPath, 'image/png').then(
    (uri) =>
      uri ??
      (theme.assetBasePath
        ? await toDataUri(
            require('node:path').join(theme.assetBasePath, theme.assets?.coverImagePath ?? ''),
            'image/png'
          )
        : undefined)
  );

  for (const slide of content.slides) {
    renderSlide(pptx, slide, theme, slide.pageType === 'cover' ? coverImg : undefined);
  }

  const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return out;
}
```

注意：上面 `coverImg` 的二次兜底写法过于绕，实现时直接简化为一次解析（资产路径 = `theme.assetBasePath ? join(assetBasePath, name) : name`），保持函数纯净；不要保留 `require`（项目是 ESM，用 `import { join } from 'node:path'`）。

- [ ] **Step 4: 运行测试通过**

Run: `pnpm --filter @ai-engineering-agent/pptx-core test`
Expected: PASS（2 用例）。若 pptxgenjs 的 `addShape('rect'...)` 类型报错，改用 `s.addShape(pptx.ShapeType.rect, ...)`。

- [ ] **Step 5: 提交**

```bash
git add packages/pptx-core
git commit -m "feat: pptx-core 实现 buildPptx 与 7 种版式渲染器

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 4: pptx-core parseTemplate（.pptx 模板主题提取）

**Files:**

- Create: `packages/pptx-core/src/parse.ts`
- Modify: `packages/pptx-core/src/index.ts`（追加 `export * from './parse.js';`）
- Test: `packages/pptx-core/src/__tests__/parse.test.ts`

**Interfaces:**

- Consumes: Task 2 的 `PptTheme`
- Produces:
  - `interface ParsedTemplate { theme: PptTheme; assets: Record<string, Buffer> }`（assets 键 = `ppt/media/` 下文件名，如 `image1.png`）
  - `parseTemplate(filePath: string): Promise<ParsedTemplate>`

- [ ] **Step 1: 写失败测试（fixture 由测试内 pptxgenjs 现做，不提交二进制）**

```typescript
// packages/pptx-core/src/__tests__/parse.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import PptxGenJS from 'pptxgenjs';
import { parseTemplate } from '../parse.js';

// 测试夹具：用 pptxgenjs 生成已知主题的小型 .pptx（临时目录，不入库）
let fixturePath: string;

beforeAll(async () => {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W16x9', width: 10, height: 5.625 });
  pptx.layout = 'W16x9';
  const s1 = pptx.addSlide();
  s1.addText('模板封面', { x: 1, y: 1, w: 8, h: 1, color: '1D4ED8', fontFace: 'Impact' });
  const s2 = pptx.addSlide();
  s2.addText('模板内容页', { x: 1, y: 1, w: 8, h: 1, color: 'C2410C', fontFace: 'Courier New' });
  const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  fixturePath = path.join(os.tmpdir(), `ppt-fixture-${Date.now()}.pptx`);
  fs.writeFileSync(fixturePath, buf);
});

afterAll(() => {
  if (fixturePath) fs.unlinkSync(fixturePath);
});

describe('parseTemplate 模板主题提取', () => {
  it('提取画幅比例 16:9 与 layoutDensity 默认 standard', async () => {
    const parsed = await parseTemplate(fixturePath);
    expect(parsed.theme.slideSize).toBe('16:9');
    expect(parsed.theme.layoutDensity).toBe('standard');
    expect(parsed.theme.mode).toBe('extracted');
  });

  it('从 theme1.xml 提取配色（accent1 → primary，dk1 → text）', async () => {
    const parsed = await parseTemplate(fixturePath);
    // pptxgenjs 默认主题 accent1 = 4472C4，dk1 = 000000
    expect(parsed.theme.colors.primary.toUpperCase()).toBe('4472C4');
    expect(parsed.theme.colors.text).toBe('000000');
  });

  it('从 fontScheme 提取字体（majorFont → fonts.title）', async () => {
    const parsed = await parseTemplate(fixturePath);
    // pptxgenjs 默认 majorFont = Calibri
    expect(parsed.theme.fonts.title).toBe('Calibri');
  });

  it('theme.name 取文件名（去扩展名）', async () => {
    const parsed = await parseTemplate(fixturePath);
    expect(parsed.theme.name).toBe(path.basename(fixturePath, '.pptx'));
    expect(parsed.theme.mode).toBe('extracted');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @ai-engineering-agent/pptx-core test`
Expected: FAIL（parse.ts 不存在）

- [ ] **Step 3: 实现 parse.ts**

```typescript
// packages/pptx-core/src/parse.ts
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

/** 无符号 32 位整数安全读取（OOXML srgbClr val 为 6 位十六进制） */
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
  for (const [tag, slot] of Object.entries(COLOR_SLOT_MAP)) {
    const node = (clrScheme as Record<string, unknown>)[tag] as Record<string, unknown> | undefined;
    const srgb = node?.['a:srgbClr'] as Record<string, unknown> | undefined;
    const sys = node?.['a:sysClr'] as Record<string, unknown> | [never, never] | undefined;
    const hex = normalizeColor(srgb?.['@_val']) ?? normalizeColor((sys as Record<string, unknown> | undefined)?.['@_lastClr']);
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
  const major = (fontScheme['a:majorFont'] as Record<string, unknown> | undefined)?.['a:latin'] as Record<string, unknown> | undefined;
  const minor = (fontScheme['a:minorFont'] as Record<string, unknown> | undefined)?.['a:latin'] as Record<string, unknown> | undefined;
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
    if (!file) continue;
    const buf = await file.async('nodebuffer');
    if (buf.length === 0) continue;
    assets[path.basename(name)] = buf;
  }

  // 背景图 = 最大的图片（≥30KB）；logo = 母版 rels 引用的图片
  const themeAssets: PptThemeAssets = {};
  const largest = Object.entries(assets).sort((a, b) => b[1].length - a[1].length)[0];
  if (largest && largest[1].length >= 30 * 1024) {
    themeAssets.backgroundPath = largest[0];
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
```

- [ ] **Step 4: 运行测试通过**

Run: `pnpm --filter @ai-engineering-agent/pptx-core test`
Expected: PASS（8 用例）

- [ ] **Step 5: 提交**

```bash
git add packages/pptx-core
git commit -m "feat: pptx-core 实现 parseTemplate 模板主题提取

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: 两个 Skill（大纲规划 + 文字美化）

**Files:**

- Create: `packages/agent-runtime/src/skills/ppt-outline-planning.ts`
- Create: `packages/agent-runtime/src/skills/ppt-content-polish.ts`
- Modify: `packages/agent-runtime/src/index.ts`（skillRegistry 与 exports 两处追加）
- Test: `packages/agent-runtime/src/__tests__/ppt-skills.test.ts`

**Interfaces:**

- Consumes: `getSlideBudget`（`@ai-engineering-agent/pptx-core`，workspace 依赖）
- Produces:
  - `pptOutlinePlanningSkill`（registry 键 `'ppt-outline-planning'`）
  - `pptContentPolishSkill`（registry 键 `'ppt-content-polish'`）

- [ ] **Step 1: 加 workspace 依赖**

Run: `pnpm --filter @ai-engineering-agent/agent-runtime add @ai-engineering-agent/pptx-core@workspace:*`

- [ ] **Step 2: 写失败测试**

```typescript
// packages/agent-runtime/src/__tests__/ppt-skills.test.ts
import { describe, it, expect } from 'vitest';
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import { pptOutlinePlanningSkill } from '../skills/ppt-outline-planning.js';
import { pptContentPolishSkill } from '../skills/ppt-content-polish.js';

describe('ppt-outline-planning.normalize', () => {
  it('补全缺省 pageType 并重排 pageNo', async () => {
    const raw: JsonObject = {
      deckTitle: '季度汇报', totalPages: 9,
      slides: [
        { pageNo: 9, title: '封面页' },
        { pageNo: 2, pageType: 'content-bullets', title: '要点页', bullets: ['要点一'] },
      ],
    };
    const out = await pptOutlinePlanningSkill.normalize!(raw);
    expect(out.totalPages).toBe(2);
    expect((out.slides as JsonObject[])[0].pageNo).toBe(1);
    expect((out.slides as JsonObject[])[0].pageType).toBe('cover');
  });
});

describe('ppt-content-polish.normalize（结构兜底）', () => {
  it('缺省字段补全、数组归一化（fitting 由 builder 的 computeFitting 负责）', async () => {
  it('输出 fitting 预算比对：超预算记 warning', async () => {
    const theme = { layoutDensity: 'standard' };
    const raw: JsonObject = {
      deckTitle: '季度汇报',
      slides: [{
        pageNo: 1, pageType: 'content-bullets',
        polishedTitle: '标题没问题',
        polishedBullets: ['这是一条超长要点，明显超过十八个字的预算上限了', '短要点'],
      }],
    };
    const out = await pptContentPolishSkill.normalize!(raw);
    const slide = (out.slides as JsonObject[])[0];
    expect((slide.polishedBullets as string[]).length).toBe(2);
    expect(slide.polishedTitle).toBe('标题没问题');
  });
});
```

- [ ] **Step 3: 实现 outline skill**

```typescript
// packages/agent-runtime/src/skills/ppt-outline-planning.ts
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import type { SkillContext, SkillDefinition, SkillPrompt } from '@ai-engineering-agent/skill-sdk';
import { getSlideBudget } from '@ai-engineering-agent/pptx-core';
import type { PptPageType, PptLayoutDensity } from '@ai-engineering-agent/pptx-core';

/** 组装大纲规划 skill — 输入素材 + 主题 + 偏好，输出 ppt-outline 结构 */
export const pptOutlinePlanningSkill: SkillDefinition = {
  name: 'ppt-outline-planning',
  version: '0.1.0',
  description: '从归一化素材提炼 PPT 大纲（金字塔结构，按主题密度分配内容）',
  inputSchema: { name: 'ppt-source' },
  outputSchema: { name: 'ppt-outline' },
  defaultModel: { model: 'auto', temperature: 0.3 },
  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    // 主题与偏好从工作流输入中解出
    const theme = (input.theme ?? {}) as Record<string, unknown>;
    const prefs = (input.preferences ?? {}) as Record<string, unknown>;
    const density = String(theme.layoutDensity ?? 'standard') as PptLayoutDensity;
    const types: PptPageType[] = ['cover', 'toc', 'section', 'content-bullets', 'content-two-col', 'quote', 'ending'];
    // 生成字数预算说明表（与 buildPptx 同源）
    const budgetLines = types.map((t) => {
      const b = getSlideBudget(t, density);
      return `- ${t}: 标题≤${b.titleMax}字, 要点≤${b.bulletCount}条, 单条≤${b.bulletChars}字`;
    });
    return {
      system: `你是一位资深 PPT 策划专家。根据素材与受众，产出结构化 PPT 大纲 JSON。
你必须输出一个合法的 JSON 对象，格式如下：
{
  "deckTitle": "string（演示文稿标题）",
  "subtitle": "string（副标题，可选）",
  "audience": "string（受众）",
  "totalPages": number,
  "slides": [{ "pageNo": 1, "pageType": "cover|toc|section|content-bullets|content-two-col|quote|ending", "title": "string", "bullets": ["..."], "notes": "string（可省）" }]
}
要求：
- 金字塔原理叙事：结论先行，cover → toc → section → content → ending 序列
- 严格按下面的字数预算分配内容，不得超出：
${budgetLines}
- 忠实素材：只重组不臆造，素材中没有的数字不得编造
- 受众适配：向上汇报突出结论与数据；团队分享突出过程与细节
- 目标页数约 ${prefs.targetPages ?? 12} 页；受众以素材 meta 与 preferences 为准
- 只输出 JSON，不要有其他文字`,
      user: `素材：
${input.markdown ?? (input.source as Record<string, unknown> | undefined)?.markdown ?? ''}
主题：${JSON.stringify(theme)}
偏好：${JSON.stringify(prefs)}`,
    };
  },
  async normalize(raw: JsonObject): Promise<JsonObject> {
    // 结构兜底：slides 数组校验、pageType 枚举兜底、pageNo 重排、totalPages 收敛
    const slides = Array.isArray(raw.slides) ? raw.slides : [];
    const VALID = ['cover', 'toc', 'section', 'content-bullets', 'content-two-col', 'quote', 'ending'];
    const normalized = slides.map((s, i) => {
      const obj = (s ?? {}) as Record<string, unknown>;
      const pageType = VALID.includes(String(obj.pageType)) ? String(obj.pageType) : 'content-bullets';
      return {
        pageNo: i + 1,
        pageType,
        title: String(obj.title ?? ''),
        bullets: Array.isArray(obj.bullets) ? obj.bullets.map(String) : [],
        notes: obj.notes === undefined ? undefined : String(obj.notes),
      };
    });
    return {
      deckTitle: String(raw.deckTitle ?? '未命名演示'),
      subtitle: raw.subtitle === undefined ? undefined : String(raw.subtitle),
      audience: String(raw.audience ?? ''),
      totalPages: normalized.length,
      slides: normalized,
    };
  },
};
```

```typescript
// packages/agent-runtime/src/skills/ppt-content-polish.ts
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import type { SkillContext, SkillDefinition, SkillPrompt } from '@ai-engineering-agent/skill-sdk';
import { getSlideBudget } from '@ai-engineering-agent/pptx-core';
import type { PptLayoutDensity, PptPageType } from '@ai-engineering-agent/pptx-core';

/** 文字美化 skill — 大纲逐页短句化 + 金句提炼 + 演讲备注，输出 ppt-content */
export const pptContentPolishSkill: SkillDefinition = {
  name: 'ppt-content-polish',
  version: '0.1.0',
  description: '按字数预算美化大纲文案（短句化、金句、演讲备注）',
  inputSchema: { name: 'ppt-outline' },
  outputSchema: { name: 'ppt-content' },
  defaultModel: { model: 'auto', temperature: 0.4 },
  async buildPrompt(ctx: SkillContext, input: JsonObject): Promise<SkillPrompt> {
    const outline = (input.outline ?? input) as Record<string, unknown>;
    const theme = (input.theme ?? {}) as Record<string, unknown>;
    const density = String(theme.layoutDensity ?? 'standard') as PptLayoutDensity;
    const types: PptPageType[] = ['cover', 'toc', 'section', 'content-bullets', 'content-two-col', 'quote', 'ending'];
    const budgetLines = types.map((t) => {
      const b = getSlideBudget(t, density);
      return `- ${t}: 标题≤${b.titleMax}字, 要点≤${b.bulletCount}条, 单条≤${b.bulletChars}字`;
    });
    return {
      system: `你是资深 PPT 文案。把大纲改写为适合演讲的最终文案 JSON：

{ "deckTitle": "...", "slides": [{ "pageNo": 1, "pageType": "...", "title": "原大纲标题", "polishedTitle": "≤12字短句标题", "polishedBullets": ["..."], "hookLine": "金句或数字", "notes": "口语化演讲备注" }] }
要求：

- 标题短句化（≤12字，动词开头优先）；bullets 名词短语优先、去虚词
- 每页提炼一条 hookLine（金句或关键数字）；cover/ending 页可省
- 生成口语化演讲备注（notes），每页 1-2 句
- 数字/专有名词保真：与大纲逐字比对，不得改动数值与专名
- 严格按字数预算（同大纲 skill 的预算表）：
  ${budgetLines}
- 只输出 JSON，不要有其他文字`,
user: `大纲：
  ${JSON.stringify(outline)}
主题：${JSON.stringify(theme)}`,
  };
  },
  async normalize(raw: JsonObject): Promise<JsonObject> {
  // 结构兜底：字段补全与数组归一化（fitting 预算比对由 pptx-builder 的 computeFitting 承担）
  const slides = Array.isArray(raw.slides) ? raw.slides : [];
  const normalized = slides.map((s, i) => {
  const obj = (s ?? {}) as Record<string, unknown>;
  return {
  pageNo: i + 1,
  pageType: String(obj.pageType ?? 'content-bullets'),
  title: String(obj.title ?? ''),
  polishedTitle: String(obj.polishedTitle ?? obj.title ?? ''),
  bullets: Array.isArray(obj.bullets) ? obj.bullets.map(String) : [],
  polishedBullets: Array.isArray(obj.polishedBullets) ? obj.polishedBullets.map(String) : [],
  hookLine: obj.hookLine === undefined ? undefined : String(obj.hookLine),
  notes: obj.notes === undefined ? undefined : String(obj.notes),
  };
  });
  return {
  deckTitle: String(raw.deckTitle ?? '未命名演示'),
  subtitle: raw.subtitle === undefined ? undefined : String(raw.subtitle),
  audience: String(raw.audience ?? ''),
  slides: normalized,
  };
  },
  };
```

- [ ] **Step 4: agent-runtime 注册表与导出追加**

```typescript
// packages/agent-runtime/src/index.ts — skillRegistry 追加：
import { pptOutlinePlanningSkill } from './skills/ppt-outline-planning';
import { pptContentPolishSkill } from './skills/ppt-content-polish';
// registry 对象内：
  'ppt-outline-planning': pptOutlinePlanningSkill,
  'ppt-content-polish': pptContentPolishSkill,
// 文件尾部 exports 追加：
export { pptOutlinePlanningSkill, pptContentPolishSkill };
```

- [ ] **Step 5: 运行测试通过 + typecheck**

Run: `pnpm --filter @ai-engineering-agent/agent-runtime test`
Expected: PASS（normalize 2 用例）。随后 `pnpm typecheck`。

- [ ] **Step 6: 提交**

```bash
git add packages/agent-runtime pnpm-lock.yaml
git commit -m "feat: 新增 ppt-outline-planning / ppt-content-polish 两个 skill

- 大纲 skill 输出 ppt-outline 合约（金字塔结构 + 字数预算约束）
- 美化 skill 短句化改写 + hookLine 金句 + 演讲备注
- fitting 预算比对职责移至 pptx-builder 的 computeFitting

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: ppt-source-collector plugin（素材归一化）

**Files:**

- Create: `plugins/ppt-source-collector/package.json`
- Create: `plugins/ppt-source-collector/src/index.ts`
- Modify: `packages/workflow-core/src/plugin-runner.ts`（runSinglePluginNode 加分发分支）
- Test: `plugins/ppt-source-collector/src/__tests__/collector.test.ts`

**Interfaces:**

- Consumes: 合约 ppt-source；platform-project 路径需要 persistence（workspace 依赖）
- Produces:
  - `collectSource(input: CollectInput, deps?: CollectorDeps): Promise<CollectResult>`
  - `type CollectInput = { sourceType: 'paste' | 'file' | 'platform-project'; text?: string; filePath?: string; projectRunId?: string }`
  - `interface CollectorDeps { parseDocx?: (b: Buffer) => Promise<string>; parsePdf?: (b: Buffer) => Promise<string>; fetchPlatformDoc?: (runId: string) => Promise<string> }`
  - `collectSource(input, deps?): Promise<{ sourceType: string; markdown: string; meta: { wordCount: number; warnings: string[]; fileName?: string; projectRunId?: string } }>`

- [ ] **Step 1: 创建包并写失败测试**

```json
// plugins/ppt-source-collector/package.json
{
  "name": "@ai-engineering-agent/ppt-source-collector",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest" },
  "dependencies": {
    "@ai-engineering-agent/persistence": "workspace:*",
    "mammoth": "^1.9.0",
    "pdf-parse": "^1.1.1"
  },
  "devDependencies": { "@types/node": "^25.6.0", "vitest": "^4.1.9" }
}
```

```typescript
// plugins/ppt-source-collector/src/__tests__/collector.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { collectSource } from '../index.js';

describe('collectSource 三路归一化', () => {
  it('paste 直通并统计字数', async () => {
    const r = await collectSource({ sourceType: 'paste', text: '# 二季度工作汇报\n完成 A 项目交付，效率提升 35%。' });
    expect(r.sourceType).toBe('paste');
    expect(r.markdown).toContain('35%');
    expect(r.meta.wordCount).toBeGreaterThan(10);
  });

  it('素材过短（<100 字）输出 warning', async () => {
    const r = await collectSource({ sourceType: 'paste', text: '太短了' });
    expect(r.meta.warnings.some((w) => w.includes('过短'))).toBe(true);
  });

  it('file 路径读 .md 文件归一化', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppt-col-'));
    const f = path.join(dir, 'memo.md');
    fs.writeFileSync(f, '# 备忘\n' + '内容行。'.repeat(30));
    const r = await collectSource({ sourceType: 'file', filePath: f });
    expect(r.markdown).toContain('备忘');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('platform-project 走注入的 fetchPlatformDoc', async () => {
    const r = await collectSource(
      { sourceType: 'platform-project', projectRunId: 'run-1' },
      { fetchPlatformDoc: async () => '# 项目介绍\n架构与页面规划内容。'.repeat(10) }
    );
    expect(r.markdown).toContain('架构与页面规划');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @ai-engineering-agent/ppt-source-collector test`
Expected: FAIL（index.ts 不存在）

- [ ] **Step 3: 实现 collector 单文件 index.ts（types/解析器/plugin 适配全在本文件）**

实现要点（签名见上方 Interfaces，行为按 Task 1-5 的 TDD 模式执行）：

- 模块内定义 `CollectInput` / `CollectorDeps` / `CollectResult`（与 Interfaces 逐字一致）
- `collectSource(input, deps?)`：三路分发——
  - `paste`: `markdown = input.text ?? ''`
  - `file`: readFile 后按扩展名分发——`.docx` → mammoth `convertToHtml`；`.pdf` → pdf-parse 取 `.text`；`.md`/纯文本 → utf-8 直读
  - `platform-project`: 默认实现经 persistence `RunStore.get(runId)` 读取 run 的 `result`，按节点顺序 `interactive_requirement → architecture_planning → page_planning` 拼接为 `## 需求文档 / ## 架构设计方案 / ## 页面规划` 的 Markdown（无数据时跳过该节）
- 默认解析器以具名函数实现（`defaultParseDocx` / `defaultParsePdf` / `defaultFetchPlatformDoc`），deps 可注入替换（单测注入 fakes）
- 字数 < 100 → warnings 追加「素材过短，建议补充内容」；> 20000 → 「素材过长，建议分段生成」
- 模块尾导出 `pptSourceCollectorPlugin: PluginDefinition`：`execute` 从 `input.source ?? input` 解出 CollectInput → `collectSource` → 返回 `{ ok: true, output }`（output 即 ppt-source 结构）

- [ ] **Step 4: plugin-runner 接线**

```typescript
// packages/workflow-core/src/plugin-runner.ts — runSinglePluginNode 内新增两个分支（与其他 plugin 分支并列）：
if (node.plugin === 'ppt-source-collector') {
  // 从工作流 input 取 source，执行收集器并返回 ppt-source
  const src = state.context.input?.source as JsonObject | undefined;
  if (!src) throw new Error('PPT 工作流缺少 source 输入');
  const { collectSource } = await import('@ai-engineering-agent/ppt-source-collector');
  const result = await collectSource(src as never);
  return { ok: true, output: result as unknown as JsonObject };
}
```

- [ ] **Step 4b: 附 plugin-runner 现状参考（执行时先 Read `runSinglePluginNode` 全文再插入分支）**

```text
plugin-runner.ts 已有分发模式（伪结构参考，勿照抄进代码）：
- 每类 plugin 一个 if 分支，import 放文件顶部（静态 import 也可，与现有一致）
- state.context.input 为工作流输入；state.nodeResults.<nodeId>.output 取上游节点输出
- 返回 { ok, output } ，校验由 outputSchema 闸门负责
```

Step 4b 无代码产出，紧接 Step 4 完成分支插入。

- [ ] **Step 5: 测试与接线验证**

Run: `pnpm --filter @ai-engineering-agent/ppt-source-collector test && pnpm typecheck`
Expected: PASS（paste 直通、过短告警、file 读取、platform-project 注入路径）。

- [ ] **Step 6: 提交**

```bash
git add plugins/ppt-source-collector packages/workflow-core/src/plugin-runner.ts pnpm-lock.yaml
git commit -m "feat: 新增 ppt-source-collector plugin 与 plugin-runner 接线

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: pptx-builder plugin（构建并发布 .pptx artifact）

**Files:**

- Create: `plugins/pptx-builder/package.json`
- Create: `plugins/pptx-builder/src/index.ts`
- Modify: `packages/workflow-core/src/plugin-runner.ts`（新增 pptx-builder 分支）
- Test: `plugins/pptx-builder/src/__tests__/builder.test.ts`

**Interfaces:**

- Consumes: Task 2 `PptTheme`、Task 3 `PptContent`/`buildPptx`、Task 2 `getSlideBudget`
- Produces:
  - `computeFitting(content: PptContent, theme: PptTheme): string[]` — 逐页比对字数预算，返回警告列表（空数组=全部达标）
  - `pptxBuilderPlugin` — plugin execute：内容+主题 → computeFitting → 超预算超 2 处则返回 ok:false（触发 retryTarget）→ buildPptx → 写 run 目录 → `ctx.artifacts.publish({kind:'pptx', path, metadata:{pageCount,sizeBytes}})`
  - plugin-runner 分支：从 `state.nodeResults.content_polish.output` 取内容、`state.context.input.theme` 取主题

- [ ] **Step 1: 创建包 + computeFitting 失败测试**

Run: 根目录 `pnpm install`（链接新 workspace 包）

- [ ] **Step 2: 实现 builder（computeFitting + pptxBuilderPlugin）**

```typescript
// plugins/pptx-builder/src/__tests__/builder.test.ts
import { describe, it, expect } from 'vitest';
import { computeFitting } from '../index.js';
import type { PptContent, PptTheme } from '@ai-engineering-agent/pptx-core';

const THEME: PptTheme = { name: 't', mode: 'preset', colors: { primary: '1D4ED8', secondary: '3B82F6', background: 'FFFFFF', surface: 'EFF6FF', text: '0F172A', accent: 'F59E0B' }, fonts: { title: 'Arial', body: 'Arial' }, slideSize: '16:9', layoutDensity: 'standard' };

const CONTENT: PptContent = {
  deckTitle: 't',
  slides: [
    { pageNo: 1, pageType: 'content-bullets', title: 't', polishedTitle: '正常页', polishedBullets: ['短要点'] },
    { pageNo: 2, pageType: 'content-bullets', polishedTitle: '超预算页', polishedBullets: Array.from({length: 6}, (_, i) => '要点'.repeat(7) + String(i)) },
  ],
};

describe('computeFitting', () => {
  it('第 2 页超预算 → 产生含页码的警告', () => {
    const warnings = computeFitting(CONTENT, THEME);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('第 2 页');
  });
  it('达标内容零警告', () => {
    const warnings = computeFitting({ ...CONTENT, slides: [CONTENT.slides[0]] }, THEME);
    expect(warnings).toHaveLength(0);
  });
});
```

```typescript
// plugins/pptx-builder/src/index.ts（要点实现）
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import type { PluginContext, PluginDefinition, PluginResult } from '@ai-engineering-agent/plugin-sdk';
import {
  buildPptx,
  getSlideBudget,
  type PptContent,
  type PptTheme,
  type PptPageType,
} from '@ai-engineering-agent/pptx-core';

/**
 * 逐页比对字数预算，返回警告列表。
 * 警告格式「第 N 页：要点 6 条超出预算 5 条」——含页码供 LLM 重试时定位。
 */
export function computeFitting(content: PptContent, theme: PptTheme): string[] {
  const warnings: string[] = [];
  for (const slide of content.slides) {
    const b = getSlideBudget(slide.pageType, theme.layoutDensity);
    const bullets = slide.polishedBullets ?? [];
    if (b.bulletCount === 0 && bullets.length > 0) {
      warnings.push(`第 ${slide.pageNo} 页：${slide.pageType} 页不应有要点`);
    }
    if (bullets.length > b.bulletCount) {
      warnings.push(`第 ${slide.pageNo} 页：要点 ${bullets.length} 条超出预算 ${b.bulletCount} 条`);
    }
    for (const line of bullets) {
      if (line.length > b.bulletChars) {
        warnings.push(`第 ${slide.pageNo} 页：单条要点 ${line.length} 字超出预算 ${b.bulletChars} 字`);
        break; // 每页最多记一条单条超长警告
      }
    }
  }
  return warnings;
}

/**
 * plugin 定义：content + theme → 构建 .pptx 并发布 artifact。
 * fitting 警告 > 2 处时返回 ok:false 触发工作流 retryTarget 回到 outline_planning。
 */
export const pptxBuilderPlugin: PluginDefinition = {
  name: 'pptx-builder',
  version: '0.1.0',
  description: '依据美化内容与主题构建 .pptx 并发布 artifact',
  outputSchema: { name: 'generation-report' },
  sideEffect: 'repo-write',
  async execute(ctx: PluginContext, input: JsonObject): Promise<PluginResult> {
    // 上游内容与主题
    const content = (input.content ?? {}) as unknown as PptContent;
    const theme = (input.theme ?? {}) as unknown as PptTheme;
    // 1) 预算比对：警告 > 2 处 → 失败触发 retryTarget
    const warnings = computeFitting(content, theme);
    if (warnings.length > 2) {
      return {
        ok: false,
        validation: {
          valid: false,
          issues: warnings.map((w) => ({ level: 'error', code: 'fitting-overflow', message: w })),
        },
      } as never;
    }
    // 2) 构建二进制
    const buffer = await buildPptx(content, theme);
    // 3) 写入 run 目录（workspaceRoot/artifacts-ppt/<runId>.pptx）
    const outDir = path.join(ctx.workspaceRoot ?? process.cwd(), 'artifacts-ppt');
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `${ctx.runId}.pptx`);
    await writeFile(outPath, buffer);
    // 4) 发布 artifact
    const artifact = await ctx.artifacts.publish({
      kind: 'pptx',
      path: outPath,
      metadata: { pageCount: content.slides.length, sizeBytes: buffer.length },
    });
    return { ok: true, output: { ok: true, artifactId: artifact.id, path: outPath, pageCount: content.slides.length }, artifacts: [artifact] };
  },
};
```

`plugins/pptx-builder/package.json`：

```json
{
  "name": "@ai-engineering-agent/pptx-builder",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest" },
  "dependencies": {
    "@ai-engineering-agent/pptx-core": "workspace:*",
    "@ai-engineering-agent/plugin-sdk": "workspace:*",
    "@ai-engineering-agent/shared-types": "workspace:*"
  },
  "devDependencies": { "@types/node": "^25.6.0", "vitest": "^4.1.9" }
}
```

- [ ] **Step 3: plugin-runner 增加 pptx-builder 分支**

```typescript
// packages/workflow-core/src/plugin-runner.ts — 与 ppt-source-collector 分支并列：
if (node.plugin === 'pptx-builder') {
  const content = state.nodeResults?.content_polish?.output as JsonObject | undefined;
  const theme = state.context.input?.theme as JsonObject | undefined;
  if (!content || !theme) throw new Error('pptx-builder 缺少 content 或 theme');
  const { pptxBuilderPlugin } = await import('@ai-engineering-agent/pptx-builder');
  const result = await pptxBuilderPlugin.execute(
    { runId: state.context.runId, nodeId: node.id, workspaceRoot: state.context.targetProject ?? process.cwd(), env: process.env, logger: console, artifacts: { publish: async (a) => ({ id: crypto.randomUUID(), ...a }) } } as never,
    { content, theme } as never,
  );
  return result as unknown as WorkflowNodeResult;
}
```

- [ ] **Step 4: 测试与 typecheck**

Run: `pnpm --filter @ai-engineering-agent/pptx-builder test && pnpm typecheck`
Expected: computeFitting 2 用例 PASS。

- [ ] **Step 5: 提交**

```bash
git add plugins/pptx-builder packages/workflow-core/src/plugin-runner.ts pnpm-lock.yaml
git commit -m "feat: 新增 pptx-builder plugin（computeFitting + pptx 构建 + artifact 发布）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: 工作流 YAML（拆分两段）+ 校验测试

**平台事实与设计调整（相对 spec §7，执行前必读）**：

现有 executor 的审批闸门是非阻断的——`onApprovalRequired` 返回 true 即继续执行，没有「暂停等待审批、审批后恢复」的机制（executor.ts:110-135；workflows.ts:201-203 的实现恒返回 true）。为不动 executor 实现「大纲确认 / 页内编辑 / 对话精炼」，把工作流拆为两段，审批交互由前端在两次 run 之间承载：

- `ppt-outline`：素材 → 大纲。精炼 = 携带 `feedback` + `previousOutline` 重跑本工作流。
- `ppt-build`：审批后大纲（可页内编辑）→ 美化 → 构建。

fitting 超预算：pptx-builder 返回 ok:false → run failed，警告写入 run result，前端展示警告并引导改大纲重跑 ppt-build（spec §11 的 retryTarget 自动重试据此调整为前端驱动，属有意偏差）。Task 7/9 的 plugin-runner 分支读取 `state.nodeResults?.content_polish?.output` 与 `state.context.input?.theme`，在本拓扑下依然成立，无需改动。

**Files:**

- Create: `workflows/ppt-outline.yaml`
- Create: `workflows/ppt-build.yaml`
- Modify: `packages/agent-runtime/src/skills/ppt-outline-planning.ts`（Task 5 产物，buildPrompt 增反馈修订段）
- Modify: `packages/workflow-core/package.json`（devDependencies 加 vitest、scripts 加 test）
- Test: `packages/workflow-core/src/__tests__/ppt-workflow.test.ts`

**Interfaces:**

- Consumes: `loadWorkflowFile` / `validateWorkflowDefinition`；Task 6 collector 输出经 executor 顶层 spread 进后续节点输入（executor.ts「currentInput = { ...currentInput, ...result.output }」），因此 outline skill 读 `input.markdown`（主计划 Task 5 的 user 模板行已同步改为 `input.markdown ?? input.source?.markdown` 兜底）
- Produces:
  - `POST /api/workflows/ppt-outline/run`，body `{ params: { source, theme, preferences?, feedback?, previousOutline? } }`
  - `POST /api/workflows/ppt-build/run`，body `{ params: { outline, theme, preferences? } }`
  - 平台 run 端点契约：`params` 被整体 spread 进工作流输入（workflows.ts:187-192），Task 12 前端按此传参
- Task 12 的两次 run 编排依赖以上端点与参数形状

- [ ] **Step 1: workflow-core 增加 vitest**

`packages/workflow-core/package.json` 追加 `scripts.test` 与 devDependencies：

```json
"scripts": { "test": "vitest" },
"devDependencies": { "vitest": "^4.1.9" }
```

Run: `pnpm install`

- [ ] **Step 2: 写失败测试**

```typescript
// packages/workflow-core/src/__tests__/ppt-workflow.test.ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadWorkflowFile } from '../loader.js';
import { validateWorkflowDefinition } from '../validator.js';

const W = (name: string) => fileURLToPath(new URL(`../../../../workflows/${name}`, import.meta.url));

describe('PPT 工作流定义（拆分两段）', () => {
  it('ppt-outline：plugin → agent，无闸门', async () => {
    const { definition } = await loadWorkflowFile(W('ppt-outline.yaml'));
    expect(validateWorkflowDefinition(definition)).toHaveLength(0);
    const nodes = definition.nodes ?? [];
    expect(nodes.map((n) => n.id)).toEqual(['source_collect', 'outline_planning']);
    expect(nodes.map((n) => n.plugin ?? n.skill)).toEqual(['ppt-source-collector', 'ppt-outline-planning']);
    expect(definition.output?.primaryFrom).toBe('outline_planning');
    expect(definition.approvalGates ?? []).toHaveLength(0);
  });

  it('ppt-build：agent → plugin，无 retryTarget（重试由前端改大纲驱动）', async () => {
    const { definition } = await loadWorkflowFile(W('ppt-build.yaml'));
    expect(validateWorkflowDefinition(definition)).toHaveLength(0);
    const nodes = definition.nodes ?? [];
    expect(nodes.map((n) => n.id)).toEqual(['content_polish', 'pptx_build']);
    expect(nodes.map((n) => n.plugin ?? n.skill)).toEqual(['ppt-content-polish', 'pptx-builder']);
    expect(nodes.every((n) => !n.retryTarget)).toBe(true);
    expect(definition.output?.primaryFrom).toBe('pptx_build');
  });
});
```

Run: `pnpm --filter @ai-engineering-agent/workflow-core test`
Expected: FAIL（两个 YAML 不存在）

- [ ] **Step 3: 写两个工作流 YAML**

```yaml
# workflows/ppt-outline.yaml
id: ppt-outline
name: PPT Outline
version: 0.1.0
description: 从素材生成 PPT 文本大纲（携带 feedback + previousOutline 即为反馈修订重跑）

input:
  fields:
    - { name: source, type: object, required: true }          # CollectInput
    - { name: theme, type: object, required: true }           # 完整 ppt-theme JSON
    - { name: preferences, type: object, required: false }    # { targetPages?, audience?, occasion? }
    - { name: feedback, type: string, required: false }       # 精炼反馈（重跑时携带）
    - { name: previousOutline, type: object, required: false } # 原大纲（重跑时携带）

nodes:
  - id: source_collect
    type: plugin
    name: 素材归一化
    plugin: ppt-source-collector
    outputSchema: ppt-source

  - id: outline_planning
    type: agent
    name: 大纲规划
    skill: ppt-outline-planning
    dependsOn: [source_collect]
    outputSchema: ppt-outline

output:
  primaryFrom: outline_planning
```

```yaml
# workflows/ppt-build.yaml
id: ppt-build
name: PPT Build
version: 0.1.0
description: 依据审批后大纲美化文字并构建 .pptx（大纲来自 ppt-outline run 结果，可页内编辑后传入）

input:
  fields:
    - { name: outline, type: object, required: true }         # 审批后的 ppt-outline JSON
    - { name: theme, type: object, required: true }
    - { name: preferences, type: object, required: false }

nodes:
  - id: content_polish
    type: agent
    name: 文字美化
    skill: ppt-content-polish
    outputSchema: ppt-content

  - id: pptx_build
    type: plugin
    name: PPTX 构建
    plugin: pptx-builder
    dependsOn: [content_polish]
    outputSchema: generation-report

output:
  primaryFrom: pptx_build
```

- [ ] **Step 4: outline skill 增加反馈修订段**

`packages/agent-runtime/src/skills/ppt-outline-planning.ts` 的 buildPrompt 内（Task 5 Step 3 实现中，`return {` 之前）追加：

```typescript
    // 大纲反馈修订：携带 feedback + previousOutline 时，在 user 提示中切换为修订模式
    const feedback = typeof input.feedback === 'string' ? input.feedback : '';
    const previousOutline = input.previousOutline;
```

并把返回对象的 `user` 模板字符串改为在尾部拼接修订段（保持原「素材/主题/偏好」内容不变）：

```typescript
      user: `素材：
${input.markdown ?? (input.source as Record<string, unknown> | undefined)?.markdown ?? ''}
主题：${JSON.stringify(theme)}
偏好：${JSON.stringify(prefs)}${
        feedback && previousOutline
          ? `

## 反馈修订
这是对已有大纲的修订重跑，请输出修订后的完整大纲（同样遵守字数预算）。
用户反馈：${feedback}
原大纲 JSON：
${JSON.stringify(previousOutline)}`
          : ''
      }`,
```

Run: `pnpm --filter @ai-engineering-agent/agent-runtime test`
Expected: PASS（Task 5 用例不受影响）

- [ ] **Step 5: 跑工作流校验测试**

Run: `pnpm --filter @ai-engineering-agent/workflow-core test`
Expected: PASS（2 用例）

- [ ] **Step 6: 提交**

```bash
git add workflows/ppt-outline.yaml workflows/ppt-build.yaml packages/workflow-core packages/agent-runtime/src/skills/ppt-outline-planning.ts
git commit -m "feat: 新增 ppt-outline/ppt-build 两段式工作流与大纲反馈修订支持

- executor 审批闸门为非阻断（平台现状），大纲审批由前端在两次 run 之间承载
- fitting 超预算改为 run failed + 前端引导改大纲重跑

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: ArtifactStore 二进制支持 + .pptx 下载路由

**Files:**

- Modify: `packages/persistence/src/store.ts`（ArtifactStore 增 3 方法，紧跟 deleteRun 之后）
- Modify: `packages/plugin-sdk/src/index.ts`（PluginContext.artifacts 增可选 saveBinary，约 29 行）
- Modify: `packages/workflow-core/package.json`（dependencies 增 `@ai-engineering-agent/persistence": "workspace:*"`）
- Modify: `packages/workflow-core/src/plugin-runner.ts`（pptx-builder 分支注入 saveBinary）
- Modify: `apps/studio-api/src/routes/runs.ts`（artifacts 文件路由二进制感知）
- Test: `packages/persistence/src/__tests__/artifact-store.test.ts`

**Interfaces:**

- Produces:
  - `ArtifactStore.getBaseDir(): string`
  - `ArtifactStore.saveBinary(runId: string, filePath: string, content: Buffer): string`（返回落盘绝对路径）
  - `ArtifactStore.readBinary(runId: string, filePath: string): Buffer | undefined`
  - `PluginContext.artifacts.saveBinary?`（可选，向后兼容）
  - 下载 URL：`GET /api/runs/<runId>/artifacts/deck.pptx`（复用 runs.ts:95 现有路由，spec §8 的"扩展 artifacts 路由"）——Task 12 前端直接使用

- [ ] **Step 1: 写失败测试**

```typescript
// packages/persistence/src/__tests__/artifact-store.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ArtifactStore } from '../store.js';

const TMP = mkdtempSync(path.join(tmpdir(), 'aiea-artifacts-'));
const store = new ArtifactStore(TMP);

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe('ArtifactStore 二进制读写', () => {
  it('saveBinary 返回绝对路径且 readBinary 往返一致', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
    const fullPath = store.saveBinary('run-1', 'deck.pptx', buf);
    expect(path.isAbsolute(fullPath)).toBe(true);
    expect(fullPath.endsWith(path.join('run-1', 'deck.pptx'))).toBe(true);
    expect(store.readBinary('run-1', 'deck.pptx')?.equals(buf)).toBe(true);
  });

  it('readBinary 文件不存在返回 undefined；getBaseDir 返回构造目录', () => {
    expect(store.readBinary('run-x', 'nope.pptx')).toBeUndefined();
    expect(store.getBaseDir()).toBe(TMP);
  });
});
```

Run: `pnpm --filter @ai-engineering-agent/persistence test`
Expected: FAIL（saveBinary 不存在）

- [ ] **Step 2: 实现 ArtifactStore 3 方法**

```typescript
// packages/persistence/src/store.ts — ArtifactStore 类内、deleteRun 之后追加
/** 返回 artifact 根目录（供下载路由等外部读取使用）。 */
getBaseDir(): string {
  return this.baseDir;
}

/** Save a binary artifact file for a run. */
saveBinary(runId: string, filePath: string, content: Buffer): string {
  const artifactDir = join(this.baseDir, runId);
  if (!existsSync(artifactDir)) {
    mkdirSync(artifactDir, { recursive: true });
  }
  const fullPath = join(artifactDir, filePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  return fullPath;
}

/** Read a binary artifact file. */
readBinary(runId: string, filePath: string): Buffer | undefined {
  const fullPath = join(this.baseDir, runId, filePath);
  if (!existsSync(fullPath)) return undefined;
  return readFileSync(fullPath);
}
```

Run: `pnpm --filter @ai-engineering-agent/persistence test`
Expected: PASS（2 用例）

- [ ] **Step 3: plugin-sdk 与 plugin-runner 接线**

`packages/plugin-sdk/src/index.ts` 的 artifacts 接口（约 29 行 publish 声明旁）追加可选方法：

```typescript
/** 保存二进制产物（Buffer），返回落盘绝对路径；由宿主注入，插件按需使用。 */
saveBinary?(runId: string, filePath: string, content: Buffer): string;
```

`packages/workflow-core/package.json` dependencies 增：

```json
"@ai-engineering-agent/persistence": "workspace:*"
```

`packages/workflow-core/src/plugin-runner.ts` 的 pptx-builder 分支改为注入真实存储（替换 Task 7 Step 3 代码中 `artifacts: { publish: ... }` 一段）：

```typescript
if (node.plugin === 'pptx-builder') {
  const content = state.nodeResults?.content_polish?.output as JsonObject | undefined;
  const theme = state.context.input?.theme as JsonObject | undefined;
  if (!content || !theme) throw new Error('pptx-builder 缺少 content 或 theme');
  // 注入真实 artifact 存储：.pptx 落 ArtifactStore，经现有 runs artifacts 路由下载
  const { ArtifactStore } = await import('@ai-engineering-agent/persistence');
  const artifactStore = new ArtifactStore();
  const { pptxBuilderPlugin } = await import('@ai-engineering-agent/pptx-builder');
  const result = await pptxBuilderPlugin.execute(
    {
      runId: state.context.runId,
      nodeId: node.id,
      workspaceRoot: state.context.targetProject ?? process.cwd(),
      env: process.env,
      logger: console,
      artifacts: {
        publish: async (a) => ({ id: crypto.randomUUID(), ...a }),
        saveBinary: (runId: string, filePath: string, buf: Buffer) =>
          artifactStore.saveBinary(runId, filePath, buf),
      },
    } as never,
    { content, theme } as never,
  );
  return result as unknown as WorkflowNodeResult;
}
```

同时修改 `plugins/pptx-builder/src/index.ts` execute 的落盘段（Task 7 Step 2 代码中「// 3) 写入 run 目录」一段），优先使用宿主注入的 saveBinary：

```typescript
    // 3) 落盘：优先 ArtifactStore（生产路径），无注入时回退本地目录（单测）
    const outPath = ctx.artifacts.saveBinary
      ? ctx.artifacts.saveBinary(ctx.runId, 'deck.pptx', buffer)
      : await (async () => {
          const outDir = path.join(ctx.workspaceRoot ?? process.cwd(), 'artifacts-ppt');
          await mkdir(outDir, { recursive: true });
          const fallback = path.join(outDir, `${ctx.runId}.pptx`);
          await writeFile(fallback, buffer);
          return fallback;
        })();
```

Run: `pnpm install && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: runs.ts 下载路由二进制感知**

`apps/studio-api/src/routes/runs.ts` 两处修改：

1. 文件顶部 CONTENT_TYPES 映射表补一行：

```typescript
pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
```

2. `GET /:id/artifacts/*path` 路由（约 95 行）中，`const content = artifactStore.read(...)` 之前按扩展名分流二进制：

```typescript
// 二进制产物（pptx 等）走 Buffer 通道，避免 utf-8 字符串往返损坏文件
const BINARY_EXTS = new Set(['pptx', 'zip', 'png', 'jpg', 'jpeg', 'gif', 'woff2']);
const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
if (BINARY_EXTS.has(ext)) {
  const buf = artifactStore.readBinary(req.params.id, filePath);
  if (buf === undefined) return res.status(404).json({ error: 'Artifact not found' });
  res.setHeader('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
  res.send(buf);
  return;
}
```

- [ ] **Step 5: 提交**

```bash
git add packages/persistence packages/plugin-sdk packages/workflow-core apps/studio-api/src/routes/runs.ts
git commit -m "feat: ArtifactStore 支持二进制产物并打通 .pptx 下载路由

- ArtifactStore 新增 saveBinary/readBinary/getBaseDir
- plugin-sdk artifacts 增可选 saveBinary，plugin-runner 注入真实存储
- runs artifacts 路由按扩展名走 Buffer 通道，Content-Disposition 附件下载

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: ppt_templates 迁移 + PptTemplateStore + 内置主题种子

**Files:**

- Create: `packages/persistence/src/migrations/002_ppt_templates.sql`（含 3 套内置主题种子）
- Create: `packages/persistence/src/ppt-templates.ts`（PptTemplateStore，与 runs.ts/sessions.ts 同级的独立 Store 文件）
- Modify: `packages/persistence/src/index.ts`（导出 PptTemplateStore）
- Test: `packages/persistence/src/__tests__/ppt-template-store.test.ts`

**Interfaces:**

- Consumes: Task 2 `PptTheme` 形状（theme 列整存 JSONB）
- Produces:
  - `PptTemplateRow = { id: string; ownerId: string | null; name: string; source: 'builtin' | 'uploaded'; theme: unknown; assetPaths: Record<string, string>; createdAt: Date }`
  - `PptTemplateStore`（构造签名与其他 Store 一致）：
    - `listByOwner(ownerId: string | null): Promise<PptTemplateRow[]>`（builtin 恒返回；uploaded 按 ownerId 过滤）
    - `get(id: string): Promise<PptTemplateRow | undefined>`
    - `create(input: { ownerId: string | null; name: string; source: 'builtin' | 'uploaded'; theme: unknown; assetPaths?: Record<string, string> }): Promise<PptTemplateRow>`
    - `delete(id: string, ownerId: string): Promise<boolean>`（仅本人 uploaded 可删，builtin 拒删）
- Task 11 路由与 Task 13 种子脚本依赖此 Store

先确认 001_init.sql 与现有 Store 的连接方式（执行时 Read `packages/persistence/src/runs.ts` 对齐构造与查询写法，保持同风格）。

- [ ] **Step 1: 写迁移 SQL（建表 + 内置主题种子）**

```sql
-- 002_ppt_templates.sql — PPT 模板表 + 内置主题种子
-- 所有时间戳用 BIGINT（与 001_init.sql 约定一致）；theme 整存 JSONB。
CREATE TABLE IF NOT EXISTS ppt_templates (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('builtin', 'uploaded')),
  theme JSONB NOT NULL,
  asset_paths JSONB NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ppt_templates_owner ON ppt_templates (owner_id);

-- 内置主题种子（幂等：重复执行跳过）；colors 无 # 前缀（与 pptx-core 预算表/测试一致）
INSERT INTO ppt_templates (id, owner_id, name, source, theme, asset_paths, created_at) VALUES
  ('theme-business-blue', NULL, '商务深蓝', 'builtin',
   $${
     "name": "商务深蓝", "mode": "preset",
     "colors": { "primary": "1D4ED8", "secondary": "3B82F6", "background": "FFFFFF", "surface": "EFF6FF", "text": "0F172A", "accent": "F59E0B" },
     "fonts": { "title": "Microsoft YaHei", "body": "Microsoft YaHei" },
     "slideSize": "16:9", "layoutDensity": "standard"
   }$$::jsonb, '{}'::jsonb, 0),
  ('theme-tech-dark', NULL, '科技暗黑', 'builtin',
   $${
     "name": "科技暗黑", "mode": "preset",
     "colors": { "primary": "22D3EE", "secondary": "818CF8", "background": "0B1120", "surface": "1E293B", "text": "E2E8F0", "accent": "34D399" },
     "fonts": { "title": "Microsoft YaHei", "body": "Microsoft YaHei" },
     "slideSize": "16:9", "layoutDensity": "standard"
   }$$::jsonb, '{}'::jsonb, 0),
  ('theme-minimal-light', NULL, '简约浅色', 'builtin',
   $${
     "name": "简约浅色", "mode": "preset",
     "colors": { "primary": "0F766E", "secondary": "14B8A6", "background": "FAFAF9", "surface": "F0FDFA", "text": "1C1917", "accent": "F97316" },
     "fonts": { "title": "Microsoft YaHei", "body": "Microsoft YaHei" },
     "slideSize": "16:9", "layoutDensity": "standard"
   }$$::jsonb, '{}'::jsonb, 0)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: 实现 PptTemplateStore**

```typescript
// packages/persistence/src/ppt-templates.ts
import { randomUUID } from 'node:crypto';
import { query, queryOne, queryAll } from './store.js';

/** PPT 模板行（内置预设与上传模板同构，theme 为完整 ppt-theme JSON） */
export interface PptTemplateRow {
  id: string;
  ownerId: string | null;
  name: string;
  source: 'builtin' | 'uploaded';
  theme: unknown;
  assetPaths: Record<string, string>;
  createdAt: number;
}

/** Map a DB row to PptTemplateRow. */
function rowToTemplate(row: Record<string, unknown>): PptTemplateRow {
  const parse = (v: unknown, fallback: unknown) =>
    typeof v === 'string' ? JSON.parse(v as string) : (v ?? fallback);
  return {
    id: row.id as string,
    ownerId: (row.owner_id as string | null) ?? null,
    name: row.name as string,
    source: row.source as 'builtin' | 'uploaded',
    theme: parse(row.theme, {}),
    assetPaths: parse(row.asset_paths, {}) as Record<string, string>,
    createdAt: Number(row.created_at ?? 0),
  };
}
```

```typescript
export class PptTemplateStore {
  /** 列出可用模板：builtin 恒可见，uploaded 仅本人 */
  async listByOwner(ownerId: string | null): Promise<PptTemplateRow[]> {
    const rows = await queryAll(
      `SELECT * FROM ppt_templates WHERE source = 'builtin' OR owner_id = $1 ORDER BY created_at ASC, id ASC`,
      [ownerId],
    );
    return rows.map(rowToTemplate);
  }

  /** 按 id 查模板 */
  async get(id: string): Promise<PptTemplateRow | undefined> {
    const row = await queryOne('SELECT * FROM ppt_templates WHERE id = $1', [id]);
    return row ? rowToTemplate(row) : undefined;
  }

  /** 新建模板（上传解析成功后调用） */
  async create(input: {
    ownerId: string | null;
    name: string;
    source: 'builtin' | 'uploaded';
    theme: unknown;
    assetPaths?: Record<string, string>;
  }): Promise<PptTemplateRow> {
    const id = randomUUID();
    const now = Date.now();
    await query(
      `INSERT INTO ppt_templates (id, owner_id, name, source, theme, asset_paths, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
      [id, input.ownerId, input.name, input.source, JSON.stringify(input.theme), JSON.stringify(input.assetPaths ?? {}), now],
    );
    return { id, ownerId: input.ownerId, name: input.name, source: input.source, theme: input.theme, assetPaths: input.assetPaths ?? {}, createdAt: now };
  }

  /** 删除模板：仅本人 uploaded 可删；builtin 或他人模板返回 false */
  async delete(id: string, ownerId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM ppt_templates WHERE id = $1 AND owner_id = $2 AND source = 'uploaded'`,
      [id, ownerId],
    );
    return result.rowCount === 1;
  }
}
```

- [ ] **Step 3: 导出 + 失败测试**

`packages/persistence/src/index.ts` 追加导出：

```typescript
export { PptTemplateStore, type PptTemplateRow } from './ppt-templates.js';
```

```typescript
// packages/persistence/src/__tests__/ppt-template-store.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PptTemplateStore, initPool, closePool } from '../index.js';

describe('PptTemplateStore', () => {
  beforeAll(async () => {
    initPool();
  });
  afterAll(async () => {
    await closePool();
  });

  it('内置主题种子可查且 builtin 不可删', async () => {
    const store = new PptTemplateStore();
    const list = await store.listByOwner('user-a');
    expect(list.filter((t) => t.source === 'builtin').length).toBeGreaterThanOrEqual(3);
    expect(await store.delete('theme-business-blue', 'user-a')).toBe(false);
  });

  it('create 后按 ownerId 隔离，删除仅限本人 uploaded', async () => {
    const store = new PptTemplateStore();
    const created = await store.create({
      ownerId: 'user-a',
      name: '我的模板',
      source: 'uploaded',
      theme: { name: '我的模板', mode: 'extracted', colors: {}, fonts: {}, slideSize: '16:9', layoutDensity: 'standard' },
    });
    expect((await store.get(created.id))?.name).toBe('我的模板');
    expect((await store.listByOwner('user-b')).some((t) => t.id === created.id)).toBe(false);
    expect(await store.delete(created.id, 'user-b')).toBe(false);
    expect(await store.delete(created.id, 'user-a')).toBe(true);
  });
});
```

Run: `pnpm --filter @ai-engineering-agent/persistence test`（需本地 PostgreSQL，与现有 sessions.test.ts 同门控）
Expected: PASS（2 用例）

- [ ] **Step 4: 提交**

```bash
git add packages/persistence
git commit -m "feat: 新增 ppt_templates 表迁移、PptTemplateStore 与 3 套内置主题种子

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 11: /api/ppt 路由 + server.ts 挂载

**Files:**

- Create: `apps/studio-api/src/routes/ppt.ts`
- Modify: `apps/studio-api/src/server.ts`（挂载路由工厂，与 artifacts.ts 等同款 `app.use('/api/ppt', createPptRouter(...))` 写法）
- Test: `apps/studio-api/src/__tests__/ppt-routes.test.ts`（若现有 routes 无测试目录，则该用例放 packages/persistence 之外可省，改为 Task 13 e2e 覆盖）

**Interfaces:**

- Consumes: Task 10 `PptTemplateStore`（listByOwner/get/create/delete）、Task 4 `parseTemplate(filePath): Promise<ParsedTemplate>`、Task 2 `PptTheme`、工作流启动（现有 POST /api/workflows/:id/run 的服务内部调用方式——执行时先 Read `apps/studio-api/src/routes/workflows.ts` 的 run 启动代码并复用同一函数/参数形状）
- Produces:
  - `GET /api/ppt/themes` → `{ builtin: PptTemplateRow[], uploaded: PptTemplateRow[] }`（userId 取 `req.user.id`，requireAuth 已在 /api 全局挂载）
  - `POST /api/ppt/templates` → body `{ name: string; fileBase64: string }`（userId 取 req.user.id）；base64 解码写临时 .pptx → `parseTemplate` 失败返回 400（不入库）→ 成功 `create({source:'uploaded', theme, assetPaths})`，资产写 ArtifactStore `<runId='templates'/<templateId>/` 目录 → 返回模板行
  - `DELETE /api/ppt/templates/:id` → 404 不存在 / 403 非本人 / 200 删除成功
  - `POST /api/ppt/uploads` → body `{ name: string; fileBase64: string }`，素材落 ArtifactStore `uploads/<uuid>/<name>`，返回 `{ source: { sourceType: 'file', filePath } }`（file 来源素材经此进入工作流输入）
  - 大纲精炼复用现有 chat/approval 通道（POST /api/workflows/runs/:runId/approve 或既有 refine 端点——执行时对齐 `workflows.ts` 已有的审批交互路由，不新建重复端点）
- Task 12 前端依赖 themes/templates/下载（下载走 Task 9 的 `/api/runs/:id/artifacts/deck.pptx`）

- [ ] **Step 1: 实现路由文件**

```typescript
// apps/studio-api/src/routes/ppt.ts
import express, { type Router } from 'express';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PptTemplateStore } from '@ai-engineering-agent/persistence';
import { parseTemplate } from '@ai-engineering-agent/pptx-core';

/** 创建 /api/ppt 路由 */
export function createPptRouter(): Router {
  const router = express.Router();
  const templateStore = new PptTemplateStore();

  // 预设主题 + 当前用户上传模板（含色板预览数据，即 theme JSON 本身）
  router.get('/themes', async (req, res) => {
    try {
      const userId = req.user?.id ?? null;
      const all = await templateStore.listByOwner(userId);
      res.json({
        builtin: all.filter((t) => t.source === 'builtin'),
        uploaded: all.filter((t) => t.source === 'uploaded'),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // 上传模板：上传即解析，失败当场报错不入库
  router.post('/templates', async (req, res) => {
    const { name, fileBase64 } = req.body as { name?: string; fileBase64?: string };
    if (!name || !fileBase64 || !req.user) {
      return res.status(400).json({ error: '缺少 name、fileBase64 或未认证' });
    }
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'aiea-ppt-'));
    try {
      const filePath = path.join(tmpDir, 'template.pptx');
      writeFileSync(filePath, Buffer.from(fileBase64, 'base64'));
      const parsed = await parseTemplate(filePath); // 非 OOXML/加密 pptx 在此抛错
      // 模板资产（logo/背景图）落 ArtifactStore，assetBasePath 指向可访问目录
      const { ArtifactStore } = await import('@ai-engineering-agent/persistence');
      const artifactStore = new ArtifactStore();
      const templateId = randomUUID();
      const assetDir = `templates/${templateId}/assets`;
      for (const [assetName, buf] of Object.entries(parsed.assets)) {
        artifactStore.saveBinary(`${assetDir}/${assetName}`, buf);
      }
      const row = await templateStore.create({
        ownerId: req.user.id,
        name,
        source: 'uploaded',
        theme: { ...parsed.theme, assetBasePath: `${artifactStore.getBaseDir()}/${assetDir}` },
        assetPaths: Object.fromEntries(Object.keys(parsed.assets).map((k) => [k, `${assetDir}/${k}`])),
      });
      res.json(row);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '仅支持未加密的 .pptx 模板' });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // 删除模板（仅本人 uploaded；builtin 拒删）
  router.delete('/templates/:id', async (req, res) => {
    try {
      const userId = req.user?.id ?? '';
      const row = await templateStore.get(req.params.id);
      if (!row) return res.status(404).json({ error: '模板不存在' });
      if (row.source === 'builtin' || row.ownerId !== userId) {
        return res.status(403).json({ error: '仅能删除本人上传的模板' });
      }
      await templateStore.delete(req.params.id, userId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // 素材文件上传：落 ArtifactStore，返回 file 来源的 source 对象（工作流输入直接可用）
  router.post('/uploads', async (req, res) => {
    const { name, fileBase64 } = req.body as { name?: string; fileBase64?: string };
    if (!name || !fileBase64) return res.status(400).json({ error: '缺少 name 或 fileBase64' });
    try {
      const { ArtifactStore } = await import('@ai-engineering-agent/persistence');
      const artifactStore = new ArtifactStore();
      const uploadId = randomUUID();
      const filePath = artifactStore.saveBinary(`uploads/${uploadId}`, name, Buffer.from(fileBase64, 'base64'));
      res.json({ source: { sourceType: 'file', filePath } });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
```

- [ ] **Step 2: 依赖与挂载**

`apps/studio-api/package.json` dependencies 增（persistence 已有）：

```json
"@ai-engineering-agent/pptx-core": "workspace:*"
```

`apps/studio-api/src/server.ts` 顶部 import 区追加：

```typescript
import { createPptRouter } from './routes/ppt.js';
```

在 `app.use('/api/sessions/:id/artifacts', ...)` 一行（约 83 行）之后追加：

```typescript
app.use('/api/ppt', createPptRouter());
```

Run: `pnpm install && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: 冒烟验证**

Run: 启动 studio-api 后 `curl -s http://localhost:4401/api/ppt/themes -H "Authorization: Bearer <token>" | head -c 300`
Expected: 返回含 3 套 builtin 主题的 JSON。

- [ ] **Step 4: 提交**

```bash
git add apps/studio-api
git commit -m "feat: 新增 /api/ppt 路由（主题列表/模板上传解析/删除/素材上传）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```
### Task 12: studio-web「PPT 工坊」面板

**Files:**

- Create: `apps/studio-web/src/components/PptPanel.tsx`
- Modify: `apps/studio-web/src/App.tsx`（NavKey、import、渲染区挂载）
- Modify: `apps/studio-web/src/components/Sidebar.tsx`（NavKey 重复定义同步 + 导航项）

**Interfaces:**

- Consumes:
  - Task 11：`GET /api/ppt/themes`、`POST /api/ppt/templates`、`DELETE /api/ppt/templates/:id`、`POST /api/ppt/uploads`
  - Task 8：`POST /api/workflows/ppt-outline/run`（body `{ params: { source, theme, preferences?, feedback?, previousOutline? } }`）、`POST /api/workflows/ppt-build/run`（body `{ params: { outline, theme, preferences? } }`）
  - `GET /api/runs/:id`（轮询状态；run.result 即 executionResult.nodeResults，见 workflows.ts:212）、`GET /api/runs/:id/artifacts/deck.pptx`（下载，Task 9）
  - 认证与 fetch 封装：执行时 Read `WorkflowPanel.tsx` / `useSessions.ts` 的请求写法并对齐（Authorization token 来源一致）
- Produces: `PptPanel` 组件（命名导出）；NavKey 两处同步为 `'chat' | 'workflows' | 'history' | 'baselines' | 'ppt'`

- [ ] **Step 1: 导航接线（精确 diff）**

```typescript
// App.tsx 第 49 行，Sidebar.tsx 第 26 行（两处同步）：
type NavKey = 'chat' | 'workflows' | 'history' | 'baselines' | 'ppt';

// App.tsx import 区（其他 Panel import 旁）：
import { PptPanel } from './components/PptPanel';

// App.tsx 渲染区（约 263 行 {activeNav === 'history' && <RunHistory />} 旁）：
{activeNav === 'ppt' && <PptPanel />}
```

Sidebar.tsx 导航项数组（Read 现有 items 定义后仿照 History 项追加，lucide-react 引入 `Presentation` 图标）：

```typescript
{ key: 'ppt', label: 'PPT 工坊', icon: <Presentation size={16} /> }
```

- [ ] **Step 2: PptPanel 组件（三视图状态机，交互细节按本步说明实现）**

视图状态机：`pick`（主题+素材+设置）→ `outline`（大纲审批/编辑/精炼）→ `building`（构建轮询，可回退 outline）→ `done`（下载/预览）。

**pick 视图：**

1. 主题卡片网格：GET /api/ppt/themes → builtin / uploaded 两组渲染；每卡显示 name + colors 六色圆点 + `${slideSize} · ${layoutDensity}` 标签；选中态高亮存 state；uploaded 卡带删除按钮（`confirm` 二次确认 → DELETE /api/ppt/templates/:id）
2. 上传模板：file input `accept=".pptx"` → FileReader 读 base64（去 dataURI 前缀）→ POST /api/ppt/templates `{ name, fileBase64 }`；期间禁用防重复；400 时展示后端 error（非 OOXML/加密 pptx）
3. 素材 tab 三选：粘贴（textarea → `{ sourceType: 'paste', text }`）｜上传文档（`.docx/.pdf/.md` → POST /api/ppt/uploads `{ name, fileBase64 }` → 返回 source）｜平台项目（GET /api/runs 过滤 status=completed 的应用生成类 run → 选中 → `{ sourceType: 'platform-project', projectRunId }`）
4. 生成设置：目标页数 number（默认 12）、受众 select（向上汇报 / 团队分享 / 对外宣讲）
5. 「生成大纲」（防重复 disabled）→ POST /api/workflows/ppt-outline/run → runId → 轮询 GET /api/runs/:id（间隔 2s）至 completed / failed；completed → 从 `run.result.outline_planning.output` 取大纲 JSON（顶层 key 为节点 id）→ 进 outline 视图；failed → 展示 run.error

**outline 视图：**

1. 编辑态 `editedOutline`（useMemo 深拷贝）；顶部 deckTitle/subtitle/audience 可编辑；每页卡片：pageType badge + title input + bullets textarea（按行拆合）
2. 「精炼」：反馈 textarea 非空才可用 → 携带原 params + `feedback` + `previousOutline: editedOutline` 重跑 ppt-outline → 轮询后用新大纲覆盖编辑态
3. 「确认，美化并构建」→ POST /api/workflows/ppt-build/run `{ params: { outline: editedOutline, theme, preferences } }` → 轮询至 completed → done；failed → 读取 run.result.pptx_build 的错误与 fitting 警告（pptx-builder ok:false 时返回 `validation.issues`，见 Task 7）在顶部警示条展示，用户改大纲后重跑

**done 视图：**

1. 「下载 .pptx」：`<a href={`/api/runs/${buildRunId}/artifacts/deck.pptx`}>`（Task 9 已设 Content-Disposition）
2. slides 全文只读预览（页码 + 标题 + 要点 + hookLine）

**硬性要求（CLAUDE.md）**：loading/empty/error 三态全覆盖；请求防重复；删模板二次确认；函数与类型中文注释；HeroUI + Tailwind 对齐现有面板风格。

- [ ] **Step 3: typecheck + 冒烟**

Run: `pnpm typecheck && pnpm --filter @ai-engineering-agent/studio-web build`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/studio-web
git commit -m "feat: 新增 PPT 工坊面板（主题选择/三源素材/大纲编辑精炼/pptx 下载）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 13: E2E 脚本 + 文档更新

**Files:**

- Create: `scripts/ppt-e2e.ts`（scripts/ 目录已有同类 tsx 脚本，执行时对齐其 import/env 写法）
- Modify: `README.md`（功能简介追加「PPT 工坊」段落）

**Interfaces:**

- Consumes: Task 1-12 全部产物；executor options 组装对齐 workflows.ts:132-183（runAgent 走 `runSkillThroughLlm` + `getSkill`，runPlugin 走 `runPluginNode`，schemas 用 `FileSchemaRegistry`）
- Produces: `npx tsx scripts/ppt-e2e.ts` 一键端到端验证（不依赖前端，直连 executor）

- [ ] **Step 1: 写脚本**

```typescript
// scripts/ppt-e2e.ts — PPT 功能端到端验证（不入 CI，对齐 spec §12）
// 1) 纯产物验证：内置最小 PptContent + 商务深蓝主题直接调 buildPptx → 落盘 sample.pptx，
//    用 JSZip 解包断言 [Content_Types].xml 与 ppt/slides/slide1.xml 存在
// 2) 大纲工作流：executor.execute(ppt-outline 定义, { source: { sourceType: 'paste', text: 示例素材 }, theme, preferences })，
//    断言 nodeResults.outline_planning.output 含 deckTitle 与 slides.length > 0
// 3) 构建工作流：executor.execute(ppt-build 定义, { outline: 第 2 步输出, theme })，
//    断言 pptx_build 节点 ok 且 ArtifactStore 中存在 <runId>/deck.pptx、sizeBytes > 0
// 无 LLM key 时（env 探测，执行时对齐 studio-api 实际变量名）：第 2/3 步打印 SKIP，仅跑第 1 步
```

（骨架按注释展开为可运行 TypeScript，全部中文注释；示例素材用 300 字左右的假想项目周报 Markdown，直接内联在脚本里。）

- [ ] **Step 2: 运行验证**

Run: `npx tsx scripts/ppt-e2e.ts`
Expected: 生成 sample.pptx；配置 LLM key 后三步全过。

- [ ] **Step 3: 文档更新**

`README.md` 功能列表追加：

```markdown
- PPT 工坊：选择内置主题或上传 .pptx 模板 → 粘贴/上传/平台项目三源输入 → AI 大纲（可编辑精炼）→ 文字美化 → 下载原生 .pptx
```

- [ ] **Step 4: 提交**

```bash
git add scripts/ppt-e2e.ts README.md
git commit -m "test: 新增 PPT 端到端验证脚本并更新文档

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```
