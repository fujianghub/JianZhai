/**
 * 符号层 — the few typographic marks that used to be typed inline
 * (``·`` separators with four different opacities, ``✓`` in three fonts).
 * One component / one CSS rule each, so they read the same everywhere.
 */
import { CheckOutlined } from '@ant-design/icons';

/** Middle-dot separator between inline meta items. */
export function SepDot({ className }: { className?: string }) {
  return (
    <span className={'jz-sep-dot' + (className ? ' ' + className : '')} aria-hidden>
      ·
    </span>
  );
}

/** "This is the current choice" mark in menus / tags. */
export function CheckMark({ className }: { className?: string }) {
  return <CheckOutlined className={'jz-check-mark' + (className ? ' ' + className : '')} aria-hidden />;
}
