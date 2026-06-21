import { describe, expect, it } from 'vitest';
import { HTML_READER_BOOTSTRAP, injectHtmlReaderBootstrap } from './htmlReaderBootstrap';

describe('injectHtmlReaderBootstrap', () => {
  it('defaults to the about:srcdoc base (raw_content mode)', () => {
    const out = injectHtmlReaderBootstrap('<html><head></head><body>hi</body></html>');
    expect(out).toContain('<base href="about:srcdoc">');
    expect(out).toContain('jz-html-meta');
  });

  it('uses the attachment URL as base when given (fetched-attachment mode)', () => {
    const out = injectHtmlReaderBootstrap(
      '<html><head></head><body>hi</body></html>',
      'https://h/media/uploads/2026/06/x.html',
    );
    expect(out).toContain('<base href="https://h/media/uploads/2026/06/x.html">');
    expect(out).not.toContain('about:srcdoc');
  });

  it('inserts bootstrap before </body>', () => {
    const out = injectHtmlReaderBootstrap('<body>hi</body>', 'https://h/x.html');
    const bootAt = out.indexOf('jz-html-meta');
    expect(bootAt).toBeGreaterThan(out.indexOf('hi'));
    expect(bootAt).toBeLessThan(out.indexOf('</body>'));
  });

  it('bootstrap defers the expensive full scan to idle time and computes innerText once', () => {
    expect(HTML_READER_BOOTSTRAP).toContain('requestIdleCallback');
    expect(HTML_READER_BOOTSTRAP).toContain('textDone');
    // innerText (forced reflow) must appear exactly once, inside the guarded block.
    expect(HTML_READER_BOOTSTRAP.split('innerText').length - 1).toBe(1);
  });

  it('bootstrap reports at DOMContentLoaded, not only window load', () => {
    expect(HTML_READER_BOOTSTRAP).toContain('DOMContentLoaded');
  });

  it('bootstrap measures immediately on execution, before the DOMContentLoaded scan', () => {
    // The injected <script> sits right before </body>, so the body above it is
    // already parsed when it runs. An immediate ``scan()`` clears the parent's
    // fallback warning without waiting for DOMContentLoaded (which author
    // <head> CDN scripts / fonts can delay past the timer).
    // The immediate ``scan();`` directly precedes the deferred ``ready(scan);``
    // — this exact adjacency is unique to the immediate call (the ``scan();``
    // inside scheduleScan's setTimeout is not followed by ready()).
    expect(HTML_READER_BOOTSTRAP).toContain('scan();ready(scan)');
  });

  it('bootstrap intercepts in-document anchor clicks (scroll instead of navigate)', () => {
    // With an http(s) base, "#sec" would resolve to the base URL and reload
    // the raw file — the bootstrap must capture those clicks.
    expect(HTML_READER_BOOTSTRAP).toContain("addEventListener('click'");
    expect(HTML_READER_BOOTSTRAP).toContain('preventDefault');
  });
});
