import { describe, expect, it } from 'vitest';
import { buildHtmlPreviewSrcdoc, withSrcdocBase } from './htmlPreview';

describe('withSrcdocBase', () => {
  it('inserts <base href="about:srcdoc"> as the first head child', () => {
    const out = withSrcdocBase('<html><head><title>x</title></head><body>hi</body></html>');
    expect(out).toContain('<head><base href="about:srcdoc"><title>x</title>');
  });

  it('falls back to inserting after <html> when there is no head', () => {
    const out = withSrcdocBase('<html><body>hi</body></html>');
    expect(out).toBe('<html><base href="about:srcdoc"><body>hi</body></html>');
  });

  it('prepends base for a bare fragment', () => {
    expect(withSrcdocBase('<p>hi</p>')).toBe('<base href="about:srcdoc"><p>hi</p>');
  });

  it('prepends srcdoc base before an author base so anchors stay in-frame', () => {
    const html = '<html><head><base href="/app/"></head><body>hi</body></html>';
    expect(withSrcdocBase(html)).toBe(
      '<html><head><base href="about:srcdoc"><base href="/app/"></head><body>hi</body></html>',
    );
  });

  it('does not double-inject when about:srcdoc base is already present', () => {
    const html = '<html><head><base href="about:srcdoc"></head><body>hi</body></html>';
    expect(withSrcdocBase(html)).toBe(html);
  });

  it('returns just the base for empty input', () => {
    expect(withSrcdocBase('')).toBe('<base href="about:srcdoc">');
  });

  it('buildHtmlPreviewSrcdoc applies the base', () => {
    expect(buildHtmlPreviewSrcdoc('<p>x</p>')).toContain('<base href="about:srcdoc">');
  });
});
