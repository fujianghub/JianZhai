// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SaveStatusPill from './SaveStatusPill';
import { SAVE_STATUS_META, type SaveStatus } from './saveStatus';

const ALL: SaveStatus[] = ['idle', 'pending', 'saving', 'saved', 'error'];

describe('SaveStatusPill', () => {
  it('五态齐全且文案来自单一表', () => {
    expect(Object.keys(SAVE_STATUS_META).sort()).toEqual([...ALL].sort());
  });

  it.each(ALL)('%s 渲染状态类、图标与文案', (status) => {
    const html = renderToStaticMarkup(<SaveStatusPill status={status} />);
    expect(html).toContain(`is-${status}`);
    expect(html).toContain('role="status"');
    expect(html).toContain('<svg');
    expect(html).toContain(SAVE_STATUS_META[status].text);
  });
});
