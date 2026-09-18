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
