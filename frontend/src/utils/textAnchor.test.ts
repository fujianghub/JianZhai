// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { collectText, describeRange, normalizeWithMap, resolveSelector } from './textAnchor';

function mount(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

function rangeOf(root: Element, nodeSel: string, s: number, e: number): Range {
  const t = root.querySelector(nodeSel)!.firstChild as Text;
  const r = document.createRange();
  r.setStart(t, s);
  r.setEnd(t, e);
  return r;
}

describe('textAnchor', () => {
  it('collects text excluding unstable subtrees', () => {
    const root = mount(
      '<p>hello</p><div class="jz-code-block"><pre>code</pre></div><div data-jz-link-card="">card</div><p>world<button>展开</button></p>',
    );
    expect(collectText(root).text).toBe('helloworld');
  });

  it('describes a range with context and heading', () => {
    const root = mount('<h2 id="sec-a">Section A</h2><p>The quick brown fox jumps over the lazy dog</p>');
    const d = describeRange(root, rangeOf(root, 'p', 4, 9))!;
    expect(d.selector.quote).toBe('quick');
    expect(d.selector.prefix).toContain('The ');
    expect(d.selector.suffix?.startsWith(' brown')).toBe(true);
    expect(d.selector.heading).toBe('sec-a');
    expect(d.headingText).toBe('Section A');
  });

  it('resolves an exact quote back to the same text', () => {
    const root = mount('<p>南朝四百八十寺，多少楼台烟雨中。</p>');
    const d = describeRange(root, rangeOf(root, 'p', 0, 7))!;
    const r = resolveSelector(root, d.selector)!;
    expect(r.range.toString()).toBe('南朝四百八十寺');
  });

  it('disambiguates duplicate quotes by context', () => {
    const root = mount('<p>价格是 100 元。</p><p>重量是 100 克。</p>');
    const ps = root.querySelectorAll('p');
    const t2 = ps[1].firstChild as Text;
    const r0 = document.createRange();
    r0.setStart(t2, 4);
    r0.setEnd(t2, 7); // "100" in the second paragraph
    const d = describeRange(root, r0)!;
    const resolved = resolveSelector(root, d.selector)!;
    expect(resolved.range.startContainer).toBe(t2);
  });

  it('prefers the occurrence inside the stored heading section', () => {
    const root = mount(
      '<h2 id="a">A</h2><p>相同的句子。</p><h2 id="b">B</h2><p>相同的句子。</p>',
    );
    const d = { quote: '相同的句子。', heading: 'b' };
    const r = resolveSelector(root, d)!;
    const second = root.querySelectorAll('p')[1].firstChild as Text;
    expect(r.range.startContainer).toBe(second);
  });

  it('spans element boundaries (bold inside a paragraph)', () => {
    const root = mount('<p>前面<strong>加粗</strong>后面</p>');
    const p = root.querySelector('p')!;
    const r0 = document.createRange();
    r0.setStart(p.firstChild as Text, 1);
    r0.setEnd(p.lastChild as Text, 1);
    const d = describeRange(root, r0)!;
    expect(d.selector.quote).toBe('面加粗后');
    const r = resolveSelector(root, d.selector)!;
    expect(r.range.toString()).toBe('面加粗后');
  });

  it('survives whitespace drift via the normalised pass', () => {
    const root = mount('<p>hello   brave\n new world</p>');
    const r = resolveSelector(root, { quote: 'hello brave new world' })!;
    expect(r.range.toString().replace(/\s+/g, ' ')).toBe('hello brave new world');
  });

  it('returns null when the quote is gone (失效)', () => {
    const root = mount('<p>completely different text</p>');
    expect(resolveSelector(root, { quote: '不存在的句子' })).toBeNull();
  });

  it('returns null for selections entirely inside excluded subtrees', () => {
    const root = mount('<div class="jz-code-block"><pre>const x = 1</pre></div>');
    const t = root.querySelector('pre')!.firstChild as Text;
    const r0 = document.createRange();
    r0.setStart(t, 0);
    r0.setEnd(t, 5);
    expect(describeRange(root, r0)).toBeNull();
  });

  it('normalizeWithMap maps back to original indices', () => {
    const { norm, map } = normalizeWithMap('  a  b\n\nc ');
    expect(norm).toBe('a b c');
    expect(map.length).toBe(norm.length);
    expect('  a  b\n\nc '[map[4]]).toBe('c');
  });

  it('element-boundary selection (triple-click paragraph) is describable', () => {
    const root = mount('<p>第一段。</p><p>第二段。</p>');
    const r0 = document.createRange();
    r0.selectNodeContents(root.querySelectorAll('p')[1]);
    const d = describeRange(root, r0)!;
    expect(d.selector.quote).toBe('第二段。');
    expect(resolveSelector(root, d.selector)!.range.toString()).toBe('第二段。');
  });
});
