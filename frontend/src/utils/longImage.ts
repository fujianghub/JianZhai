/**
 * 正文长图三段式判定（显示层，不写入文档内容）：
 *
 *  1. 按容器宽渲染后高度 ≤ 限高（IMG_MAX_VH）→ 'none'，原样显示；
 *  2. 超限 → 'capped'，CSS `max-height` 等比缩到正好限高（连续缩放，无档位跳变）；
 *  3. 缩到限高后宽度会跌破 IMG_MIN_RENDER_WIDTH（文字不可读）→ 'folded'，
 *     由 LongImageEnhancer 包折叠容器（限高裁剪 + 渐隐 + 展开/收起）。
 *
 * 判定收敛为纯函数以便脱离 DOM 单测（happy-dom 无真实布局）。
 */

/** 限高（vh）。与 markdown.css 的 `--jz-img-max-h: 70vh` 保持同步。 */
export const IMG_MAX_VH = 70;

/** cap 后宽度跌破此值（px）→ 折叠模式。 */
export const IMG_MIN_RENDER_WIDTH = 320;

export type LongImageMode = 'none' | 'capped' | 'folded';

export function classifyLongImage(opts: {
  naturalWidth: number;
  naturalHeight: number;
  /** 图片所在容器的内容宽（px）。 */
  containerWidth: number;
  /** 限高像素值 = window.innerHeight * IMG_MAX_VH / 100。 */
  maxHeightPx: number;
  /** img 带 width/height 属性（作者在 Tiptap 手动 resize）→ 豁免。 */
  hasManualSize: boolean;
}): LongImageMode {
  const { naturalWidth: w, naturalHeight: h, containerWidth, maxHeightPx } = opts;
  if (opts.hasManualSize) return 'none';
  if (w <= 0 || h <= 0 || containerWidth <= 0 || maxHeightPx <= 0) return 'none';
  // max-width:100% 只缩不放：渲染宽取容器宽与自然宽的较小者
  const renderW = Math.min(containerWidth, w);
  const renderH = (renderW * h) / w;
  if (renderH <= maxHeightPx) return 'none';
  const cappedW = (maxHeightPx * w) / h;
  return cappedW >= IMG_MIN_RENDER_WIDTH ? 'capped' : 'folded';
}
