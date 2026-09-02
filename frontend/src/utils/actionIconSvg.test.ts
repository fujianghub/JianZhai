import { describe, expect, it } from 'vitest';
import { ACTION_ICON_PATHS, actionIconSvg } from './actionIconSvg';

/** 只允许 DOMPurify 默认放行的 SVG 元素/属性，否则阅读页 sanitize 会剥掉图标。 */
const ALLOWED_TAGS = new Set(['svg', 'path', 'rect', 'circle']);
const ALLOWED_ATTRS = new Set([
  'class', 'viewbox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'aria-hidden', 'd', 'x', 'y', 'rx', 'cx', 'cy', 'r',
]);

describe('actionIconSvg', () => {
  const names = Object.keys(ACTION_ICON_PATHS) as Array<keyof typeof ACTION_ICON_PATHS>;

  it.each(names)('%s 只含允许的元素与属性', (name) => {
    const svg = actionIconSvg(name);
    for (const m of svg.matchAll(/<([a-z]+)\b([^>]*)>/g)) {
      expect(ALLOWED_TAGS.has(m[1]), `元素 <${m[1]}>`).toBe(true);
      for (const a of m[2].matchAll(/([a-zA-Z-]+)="/g)) {
        expect(ALLOWED_ATTRS.has(a[1].toLowerCase()), `属性 ${a[1]}`).toBe(true);
      }
    }
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('aria-hidden="true"');
  });

  it('尺寸 / 描边 / class 可覆盖', () => {
    const svg = actionIconSvg('check', { size: 20, strokeWidth: 2, className: 'x' });
    expect(svg).toContain('width="20"');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('class="x"');
  });
});
