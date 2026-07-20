import { describe, expect, it } from 'vitest';
import { findLinkAt, linkToCard, linkToPlain, linkToTitle } from './linkAt';

function apply(doc: string, ins: { from: number; to: number; insert: string }): string {
  return doc.slice(0, ins.from) + ins.insert + doc.slice(ins.to);
}

describe('findLinkAt', () => {
  const doc = '前文 [示例](https://a.com) 后文\n第二行 [B](doc:12)';

  it('finds the link when cursor is inside / at edges', () => {
    const from = doc.indexOf('[示例]');
    const to = doc.indexOf(') 后文') + 1;
    for (const pos of [from, from + 2, to]) {
      const link = findLinkAt(doc, pos);
      expect(link).not.toBeNull();
      expect(link!.text).toBe('示例');
      expect(link!.href).toBe('https://a.com');
      expect(link!.from).toBe(from);
      expect(link!.to).toBe(to);
    }
  });

  it('returns null outside any link', () => {
    expect(findLinkAt(doc, 0)).toBeNull();
    expect(findLinkAt(doc, doc.indexOf('后文'))).toBeNull();
  });

  it('only scans the cursor line', () => {
    const pos = doc.indexOf('[B]');
    expect(findLinkAt(doc, pos + 1)!.href).toBe('doc:12');
  });

  it('ignores images', () => {
    const d = '![图片](https://a.com/x.png)';
    expect(findLinkAt(d, 4)).toBeNull();
  });

  it('keeps the mention @ prefix outside the range but tracked via atFrom', () => {
    const d = '看 @[标题](doc:3) 这篇';
    const link = findLinkAt(d, d.indexOf('[标题]') + 1)!;
    expect(link.text).toBe('标题');
    expect(link.atFrom).toBe(link.from - 1);
    expect(d[link.atFrom]).toBe('@');
  });

  it('handles two links on one line by cursor position', () => {
    const d = '[甲](https://a.com) 和 [乙](https://b.com)';
    expect(findLinkAt(d, 2)!.href).toBe('https://a.com');
    expect(findLinkAt(d, d.indexOf('[乙]') + 1)!.href).toBe('https://b.com');
  });

  it('tolerates one nesting level of parens in url', () => {
    const d = '[wiki](https://a.com/x_(y))';
    expect(findLinkAt(d, 3)!.href).toBe('https://a.com/x_(y)');
  });
});

describe('linkToPlain / linkToTitle', () => {
  const doc = '看 [标题文字](https://a.com) 吧';
  const link = findLinkAt(doc, 4)!;

  it('plain replaces text with the href', () => {
    expect(apply(doc, linkToPlain(link))).toBe('看 [https://a.com](https://a.com) 吧');
  });

  it('title replaces text with the fetched title', () => {
    expect(apply(doc, linkToTitle(link, '真标题'))).toBe('看 [真标题](https://a.com) 吧');
  });
});

describe('linkToCard', () => {
  it('replaces a whole-line link in place', () => {
    const doc = '上文\n[t](https://a.com)\n下文';
    const link = findLinkAt(doc, doc.indexOf('[t]') + 1)!;
    const out = apply(doc, linkToCard(doc, link, '[[link-card:https://a.com]]'));
    expect(out).toBe('上文\n[[link-card:https://a.com]]\n下文');
  });

  it('moves the card to its own line when the link sits inside prose', () => {
    const doc = '前 [t](doc:5) 后';
    const link = findLinkAt(doc, 3)!;
    const out = apply(doc, linkToCard(doc, link, '[[doc-card:5]]'));
    expect(out).toBe('前  后\n[[doc-card:5]]');
  });

  it('swallows the mention @ prefix when replacing the whole line', () => {
    const doc = '@[标题](doc:7)';
    const link = findLinkAt(doc, 2)!;
    const out = apply(doc, linkToCard(doc, link, '[[doc-card:7]]'));
    expect(out).toBe('[[doc-card:7]]');
  });
});
