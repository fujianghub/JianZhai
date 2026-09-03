/**
 * Chevron — the one expand / collapse glyph (2026-09-03).
 *
 * A rounded-stroke right chevron that rotates 90° (spring) when ``open``; every tree,
 * fold heading, code-block collapse, AntD Tree switcher and Collapse
 * expandIcon renders this so the whole site folds with one motion (the
 * previous mix: rotating RightOutlined / swapped CaretRight↔CaretDown /
 * `▸`↔`▾` pseudo-element characters / bare AntD defaults).
 *
 * ``ChevronButton`` is the clickable variant for tree rows — an IconButton
 * with the chevron inside, so hover / pressed / focus states come for free.
 */
import IconButton, { type IconButtonProps } from './IconButton';

interface ChevronProps {
  open: boolean;
  /** Glyph size in px (defaults to the surrounding font size). */
  size?: number;
  className?: string;
}

export default function Chevron({ open, size, className }: ChevronProps) {
  /* Rounded stroke (2.2 / round caps + joins) on a 24 grid — the AntD
     RightOutlined it replaced was a 1px hairline that read as a splinter at
     tree-row sizes. Rotation + spring live in theme.css (.jz-chevron). */
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size ?? '1em'}
      height={size ?? '1em'}
      className={'jz-chevron jz-icon' + (open ? ' is-open' : '') + (className ? ' ' + className : '')}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.5 6.5l5.5 5.5-5.5 5.5" />
    </svg>
  );
}

export function ChevronButton({ open, ...rest }: Omit<IconButtonProps, 'icon'> & { open: boolean }) {
  return <IconButton icon={<Chevron open={open} />} aria-expanded={open} {...rest} />;
}
