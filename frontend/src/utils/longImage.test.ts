import { describe, expect, it } from 'vitest';
import { classifyLongImage, IMG_MAX_VH, IMG_MIN_RENDER_WIDTH } from './longImage';

// 基准场景：容器 800px 宽、视口 1000px 高 → 限高 700px
const base = {
  containerWidth: 800,
  maxHeightPx: (1000 * IMG_MAX_VH) / 100, // 700
  hasManualSize: false,
};

describe('classifyLongImage', () => {
  it('渲染高不超限 → none（普通横图原样）', () => {
    // 1600×1200 → renderW=800, renderH=600 ≤ 700
    expect(
      classifyLongImage({ ...base, naturalWidth: 1600, naturalHeight: 1200 }),
    ).toBe('none');
  });

  it('超限且 cap 后宽度 ≥ 下限 → capped（中等竖图连续缩放）', () => {
    // 900×1800 → renderH=1600 > 700; cappedW = 700*900/1800 = 350 ≥ 320
    expect(
      classifyLongImage({ ...base, naturalWidth: 900, naturalHeight: 1800 }),
    ).toBe('capped');
  });

  it('cap 后宽度跌破下限 → folded（手机长截图折叠）', () => {
    // 750×8000 → cappedW = 700*750/8000 ≈ 66 < 320
    expect(
      classifyLongImage({ ...base, naturalWidth: 750, naturalHeight: 8000 }),
    ).toBe('folded');
  });

  it('cap 后宽度恰在下限边界 → capped（≥ 为闭区间）', () => {
    // 构造 cappedW 恰好 = 320：h = 700*w/320
    const w = 640;
    const h = (base.maxHeightPx * w) / IMG_MIN_RENDER_WIDTH; // 1400
    expect(classifyLongImage({ ...base, naturalWidth: w, naturalHeight: h })).toBe(
      'capped',
    );
  });

  it('作者手动设定尺寸 → 恒 none（豁免）', () => {
    expect(
      classifyLongImage({
        ...base,
        naturalWidth: 750,
        naturalHeight: 8000,
        hasManualSize: true,
      }),
    ).toBe('none');
  });

  it('未加载 / 病态输入（任一维度 ≤ 0）→ none', () => {
    expect(classifyLongImage({ ...base, naturalWidth: 0, naturalHeight: 0 })).toBe('none');
    expect(
      classifyLongImage({ ...base, naturalWidth: 750, naturalHeight: 8000, containerWidth: 0 }),
    ).toBe('none');
    expect(
      classifyLongImage({ ...base, naturalWidth: 750, naturalHeight: 8000, maxHeightPx: 0 }),
    ).toBe('none');
  });

  it('自然宽小于容器宽时按自然宽渲染（max-width 只缩不放）', () => {
    // 400×600：renderW=400（非 800），renderH=600 ≤ 700 → none。
    // 若错误地按容器宽放大（renderH=1200）会误判超限。
    expect(
      classifyLongImage({ ...base, naturalWidth: 400, naturalHeight: 600 }),
    ).toBe('none');
  });
});
