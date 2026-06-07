import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHtmlPreviewSrcdoc, rewriteRootRelativeAssets, withBaseHref, withSrcdocBase } from './htmlPreview';

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

describe('rewriteRootRelativeAssets', () => {
  // Tests run in vitest's node environment (no `window`), so explicitly stub
  // VITE_MEDIA_BASE_URL — production / dev both rely on that env var.
  beforeEach(() => { vi.stubEnv('VITE_MEDIA_BASE_URL', 'http://test-host:8002/media'); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('rewrites /media/ image src to absolute', () => {
    const out = rewriteRootRelativeAssets('<img src="/media/uploads/2026/05/a.png">');
    expect(out).toBe('<img src="http://test-host:8002/media/uploads/2026/05/a.png">');
  });

  it('rewrites /static/ link href and leaves other paths alone', () => {
    const html = '<link href="/static/x.css"><a href="/some/page">x</a><img src="https://cdn/y.png">';
    const out = rewriteRootRelativeAssets(html);
    expect(out).toContain('<link href="http://test-host:8002/static/x.css">');
    // Non-media/static root-relative paths and absolute URLs left alone.
    expect(out).toContain('<a href="/some/page">');
    expect(out).toContain('<img src="https://cdn/y.png">');
  });

  it('handles single quotes', () => {
    const out = rewriteRootRelativeAssets("<img src='/media/p.png'>");
    expect(out).toBe("<img src='http://test-host:8002/media/p.png'>");
  });

  it('is a no-op on empty input', () => {
    expect(rewriteRootRelativeAssets('')).toBe('');
  });
});

describe('withBaseHref', () => {
  it('inserts the given href as first child of <head>', () => {
    const out = withBaseHref('<html><head><title>x</title></head><body>hi</body></html>', 'https://h/media/a/x.html');
    expect(out).toBe('<html><head><base href="https://h/media/a/x.html"><title>x</title></head><body>hi</body></html>');
  });

  it('prepends before an author <base> so ours wins', () => {
    const out = withBaseHref('<head><base href="/"><link href="./a.css"></head>', 'https://h/x.html');
    expect(out.indexOf('https://h/x.html')).toBeLessThan(out.indexOf('href="/"'));
  });

  it('escapes the href attribute', () => {
    const out = withBaseHref('<p>hi</p>', 'https://h/x.html?a=1&b="2"');
    expect(out).toContain('<base href="https://h/x.html?a=1&amp;b=&quot;2&quot;">');
  });

  it('handles empty html', () => {
    expect(withBaseHref('', 'https://h/x.html')).toBe('<base href="https://h/x.html">');
  });
});
