// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { JzExportIcon, JzProfileIcon, JzTagIcon } from './JzIconKit';

/**
 * JzIconKit props 展开顺序（2026-09-02 修复）：每枚图标自带的 strokeWidth
 * 曾写在 `{...p}` 之后，调用方的 `strokeWidth={2}` 小尺寸补偿被反向吞掉
 * （PostDetail 的 JzTagIcon / JzExportIcon 一直失效）。现在 rest 后置即胜，
 * 与 JzIcon.tsx 的 Wrap 一致。
 */
describe('JzIconKit 调用方 props 胜过图标默认', () => {
  it('strokeWidth 可被调用方覆盖', () => {
    expect(renderToStaticMarkup(<JzExportIcon size={14} strokeWidth={2} />)).toContain('stroke-width="2"');
    expect(renderToStaticMarkup(<JzTagIcon size={14} strokeWidth={2} />)).toContain('stroke-width="2"');
  });

  it('未传时保留图标自带描边', () => {
    expect(renderToStaticMarkup(<JzExportIcon />)).toContain('stroke-width="28"');
  });

  it('JzProfileIcon 视窗为正方形（1321 宽源稿上下补边，不再被压扁）', () => {
    const html = renderToStaticMarkup(<JzProfileIcon size={24} />);
    const m = html.match(/viewBox="([^"]+)"/);
    expect(m).not.toBeNull();
    const [, , w, h] = m![1].split(' ').map(Number);
    expect(w).toBe(h);
    expect(html).toContain('width="24"');
    expect(html).toContain('height="24"');
  });
});
