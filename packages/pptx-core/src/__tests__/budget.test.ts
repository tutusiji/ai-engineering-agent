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
