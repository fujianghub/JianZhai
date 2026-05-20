import { useEffect, useRef, useState } from 'react';
import { renderMermaid } from '@/utils/mermaid';

interface Props {
  source: string;
  /** Optional aria-label / title shown under the diagram. */
  caption?: string;
}

/** Render a Mermaid diagram inline, re-rendering when the document theme
 *  changes so dark/starry palettes pick up new colors. */
export default function MermaidDiagram({ source, caption }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    // Re-render when the html data-theme attribute changes (ThemeSwitcher
    // toggles it). The mermaid util keys its theme cache off the attribute, so
    // bumping `version` is enough to trigger a fresh render() call.
    const obs = new MutationObserver(() => setVersion((v) => v + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    renderMermaid(source)
      .then((svg) => {
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = svg;
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '渲染失败');
      });
    return () => {
      cancelled = true;
    };
  }, [source, version]);

  return (
    <div className="jz-mermaid-block">
      <div ref={hostRef} className="jz-mermaid-canvas" />
      {caption && <div className="jz-mermaid-caption">{caption}</div>}
      {error && (
        <div className="jz-mermaid-error">
          Mermaid 渲染失败：<code>{error}</code>
        </div>
      )}
    </div>
  );
}
