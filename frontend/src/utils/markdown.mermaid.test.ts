/**
 * Yuque-style mermaid / plantuml rendering through markdown-it.
 *
 * Two regressions this guards against:
 *
 *   1. **Source code leak** — pre-v0.9.3 the source ``<pre>`` rendered visible
 *      even though it had ``hidden``. ``markdown.css`` set
 *      ``display: block !important`` on ``.jz-mermaid-source`` and won over
 *      the ``hidden`` attribute. Users saw the raw code below every diagram,
 *      defeating the "diagram-first" intent.
 *
 *   2. **Action chrome regression** — the new Yuque-style floating action row
 *      replaces the old always-on toolbar. Tests pin the expected DOM so
 *      future refactors don't accidentally revert to the toolbar look.
 */
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('mermaid / plantuml Yuque-style block', () => {
  it('renders a diagram block wrapper for mermaid', () => {
    const html = renderMarkdown('```mermaid\ngraph TD\nA-->B\n```');
    expect(html).toMatch(/class="jz-code-block jz-diagram-block jz-code-mermaid/);
    expect(html).toContain('data-lang="mermaid"');
  });

  it('renders a diagram block wrapper for plantuml', () => {
    const html = renderMarkdown('```plantuml\n@startuml\nA->B\n@enduml\n```');
    expect(html).toMatch(/class="jz-code-block jz-diagram-block jz-code-plantuml/);
    expect(html).toContain('data-lang="plantuml"');
  });

  it('marks the source <pre> as hidden by default (Yuque-style)', () => {
    const html = renderMarkdown('```mermaid\nA-->B\n```');
    expect(html).toMatch(/<pre[^>]*\bclass="[^"]*jz-mermaid-source[^"]*"[^>]*\bhidden\b/);
  });

  it('does NOT emit the heavy code toolbar on diagram blocks', () => {
    const html = renderMarkdown('```mermaid\nA-->B\n```');
    expect(html).not.toContain('jz-code-toolbar');
    expect(html).not.toContain('jz-code-title-area');
  });

  it('emits a floating action row with source / copy / download / fullscreen', () => {
    const html = renderMarkdown('```mermaid\nA-->B\n```');
    expect(html).toContain('jz-diagram-actions');
    expect(html).toMatch(/data-action="mermaid-source"/);
    expect(html).toMatch(/data-action="copy"/);
    expect(html).toMatch(/data-action="diagram-download"/);
    expect(html).toMatch(/data-action="diagram-fullscreen"/);
  });

  it('still emits the canvas placeholder + base64 source attr', () => {
    const html = renderMarkdown('```mermaid\nA-->B\n```');
    expect(html).toContain('jz-mermaid-canvas');
    expect(html).toMatch(/data-source="[A-Za-z0-9+/=]+"/);
    expect(html).toContain('正在渲染图表…');
  });

  it('plantuml shows the remote-fetch loading hint instead of mermaid text', () => {
    const html = renderMarkdown('```plantuml\n@startuml\nA->B\n@enduml\n```');
    expect(html).toContain('正在向 PlantUML 服务请求…');
  });

  it('regular (non-diagram) code blocks still use the legacy toolbar chrome', () => {
    const html = renderMarkdown('```python\nx = 1\n```');
    expect(html).toContain('jz-code-toolbar');
    expect(html).not.toContain('jz-diagram-block');
    expect(html).not.toContain('jz-diagram-actions');
  });
});
