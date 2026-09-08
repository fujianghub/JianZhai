/**
 * Chevron — the one *direction* glyph (2026-09-03, wired site-wide 2026-09-09).
 *
 * A rounded-stroke chevron on the 24 grid (Lucide proportions, 2.0 stroke —
 * one step heavier than the 1.5 Jz line icons because a marker has to read at
 * 12–14px next to CJK text; the AntD Left/Right/Down/UpOutlined it replaces is
 * a ~1px hairline that disappears beside them).
 *
 * Semantics split (user decision, 2026-09-03): a chevron means direction /
 * navigation — reader prev/next page, prev/next post, dropdown & Select carets,
 * submenu arrows, search prev/next hit. "There is more below this row" is
 * ``Disclosure`` (solid rounded triangle). Never mix the two.
 *
 * - ``direction``: right (default) / left / up / down — static rotation.
 * - ``double``: two chevrons (first / last, prev / next chapter).
 * - ``open``: legacy toggle — adds ``.is-open`` so theme.css rotates the whole
 *   glyph 90° on the spring (kept for any caret that flips when a menu opens).
 * - ``ChevronButton``: IconButton wrapper for clickable arrows (hover / pressed /
 *   focus states for free). Size defaults to the surrounding font size.
 *
 * ``chevronDiscipline.test`` forbids importing the AntD direction icons so the
 * surface keeps converging here; innerHTML surfaces use
 * ``actionIconSvg('chevron-right' | 'caret')``.
 */
import type { CSSProperties } from 'react';
import IconButton, { type IconButtonProps } from './IconButton';

export type ChevronDirection = 'right' | 'left' | 'up' | 'down';

interface ChevronProps {
  direction?: ChevronDirection;
  double?: boolean;
  open?: boolean;
  /** Glyph size in px (defaults to the surrounding font size). */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

const ROTATION: Record<ChevronDirection, number> = { right: 0, down: 90, left: 180, up: 270 };

/** Right-pointing paths (Lucide `chevron-right` / `chevrons-right`); other directions rotate. */
export const CHEVRON_PATH = 'm9 18 6-6-6-6';
export const CHEVRONS_PATH = 'm6 17 5-5-5-5M13 17l5-5-5-5';

export default function Chevron({ direction = 'right', double, open, size, className, style }: ChevronProps) {
  const rot = ROTATION[direction];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size ?? '1em'}
      height={size ?? '1em'}
      className={
        'jz-chevron jz-icon' + (open ? ' is-open' : '') + (className ? ' ' + className : '')
      }
      data-dir={direction}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={double ? CHEVRONS_PATH : CHEVRON_PATH} transform={rot ? `rotate(${rot} 12 12)` : undefined} />
    </svg>
  );
}

export function ChevronButton({
  direction,
  double,
  open,
  ...rest
}: Omit<IconButtonProps, 'icon'> & Pick<ChevronProps, 'direction' | 'double' | 'open'>) {
  return (
    <IconButton
      icon={<Chevron direction={direction} double={double} open={open} />}
      aria-expanded={open}
      {...rest}
    />
  );
}

/** 按钮文字后的下拉 caret（「新建 ▾」「上传 ▾」「H ▾」…）：12px，左侧 4px 呼吸。 */
export function CaretIcon({ className }: { className?: string }) {
  return <Chevron direction="down" size={12} className={'jz-btn-caret' + (className ? ' ' + className : '')} />;
}
