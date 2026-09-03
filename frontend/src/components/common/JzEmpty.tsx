/**
 * JzEmpty — the one empty state (2026-09-03). AntD's Empty shipped two
 * different illustrations (default grey box vs PRESENTED_IMAGE_SIMPLE) that
 * sat side by side on the reading page; this is a single line-glyph + one
 * sentence + optional action, sized ``md`` (page regions) or ``sm`` (panels).
 */
import type { CSSProperties, ReactNode } from 'react';

interface Props {
  description: ReactNode;
  /** Replace the default tray glyph (a Jz line icon). */
  icon?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
  style?: CSSProperties;
  /** Action(s) rendered under the sentence — a Button, a link… */
  children?: ReactNode;
}

function TrayGlyph() {
  return (
    <svg viewBox="0 0 48 48" width="1em" height="1em" className="jz-icon" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 26.5 12.5 15h23L40 26.5V34a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z" fill="currentColor" fillOpacity={0.1} />
      <path d="M8 26.5h9.5l2 3.5h9l2-3.5H40" />
      <path d="M18 9.5h12M20.5 5.5h7" opacity={0.6} />
    </svg>
  );
}

export default function JzEmpty({ description, icon, size = 'md', className, style, children }: Props) {
  return (
    <div className={'jz-empty is-' + size + (className ? ' ' + className : '')} style={style} role="status">
      <span className="jz-empty-glyph">{icon ?? <TrayGlyph />}</span>
      <div className="jz-empty-text">{description}</div>
      {children ? <div className="jz-empty-action">{children}</div> : null}
    </div>
  );
}
