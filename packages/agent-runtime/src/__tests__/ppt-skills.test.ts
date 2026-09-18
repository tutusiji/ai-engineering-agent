// PPT 两个 skill 的 normalize 结构兜底单测（畸形输入：缺字段 / 错枚举 / 超页）
import { describe, it, expect } from 'vitest';
import type { JsonObject } from '@ai-engineering-agent/shared-types';
import { pptOutlinePlanningSkill } from '../skills/ppt-outline-planning.js';
import { pptContentPolishSkill } from '../skills/ppt-content-polish.js';

describe('ppt-outline-planning.normalize', () => {
  it('补全缺省 pageType 并重排 pageNo', async () => {
    const raw: JsonObject = {
      deckTitle: '季度汇报',
      totalPages: 9,
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

  it('非法 pageType 回落 content-bullets，totalPages 收敛到实际数组长度', async () => {
    const raw: JsonObject = {
      deckTitle: '季度汇报',
      totalPages: 5,
      slides: [
        { pageNo: 1, pageType: 'cover', title: '封面页' },
        { pageNo: 2, pageType: 'content-list', title: '列表页', bullets: ['要点一'] },
      ],
    };
    const out = await pptOutlinePlanningSkill.normalize!(raw);
    expect(out.totalPages).toBe(2);
    expect((out.slides as JsonObject[])[0].pageType).toBe('cover');
    expect((out.slides as JsonObject[])[1].pageType).toBe('content-bullets');
  });
});

describe('ppt-content-polish.normalize（结构兜底）', () => {
  it('缺省字段补全、数组归一化（fitting 由 builder 的 computeFitting 负责）', async () => {
    const raw: JsonObject = {
      deckTitle: '季度汇报',
      slides: [{ pageNo: 1, pageType: 'content-bullets', title: '原标题' }],
    };
    const out = await pptContentPolishSkill.normalize!(raw);
    const slide = (out.slides as JsonObject[])[0];
    expect(slide.pageNo).toBe(1);
    expect(slide.pageType).toBe('content-bullets');
    expect(slide.title).toBe('原标题');
    expect(slide.polishedTitle).toBe('原标题');
    expect(slide.polishedBullets).toEqual([]);
    expect(slide.hookLine).toBeUndefined();
    expect(slide.notes).toBeUndefined();
  });

  it('超预算要点不裁剪、polishedTitle 原样保留（fitting 预算比对由 builder 的 computeFitting 负责）', async () => {
    const raw: JsonObject = {
      deckTitle: '季度汇报',
      slides: [
        {
          pageNo: 1,
          pageType: 'content-bullets',
          polishedTitle: '标题没问题',
          polishedBullets: ['这是一条超长要点，明显超过十八个字的预算上限了', '短要点'],
        },
      ],
    };
    const out = await pptContentPolishSkill.normalize!(raw);
    const slide = (out.slides as JsonObject[])[0];
    expect((slide.polishedBullets as string[]).length).toBe(2);
    expect(slide.polishedTitle).toBe('标题没问题');
  });
});
