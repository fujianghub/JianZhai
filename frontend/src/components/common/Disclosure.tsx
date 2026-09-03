/**
 * Disclosure — the one expand / collapse marker for trees, outlines and
 * folds (2026-09-03, third round). A small solid triangle with rounded
 * corners (macOS disclosure triangle / 有道云 / Notion toggle), rotating 90°
 * on the spring when ``open``.
 *
 * Semantics split (user decision): a solid triangle means "there is more
 * below this row"; a chevron (``Chevron.tsx``) means direction / navigation
 * (breadcrumbs, prev-next, dropdown carets). Never mix the two.
 */
interface DisclosureProps {
  open: boolean;
  /** Glyph size in px (defaults to the surrounding font size). */
  size?: number;
  className?: string;
}

export default function Disclosure({ open, size, className }: DisclosureProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size ?? '1em'}
      height={size ?? '1em'}
      className={'jz-disclosure jz-icon' + (open ? ' is-open' : '') + (className ? ' ' + className : '')}
      aria-hidden="true"
    >
      {/* Isosceles triangle, apex right; 1.6px same-colour stroke with round
          joins is what rounds the corners (no bezier tips to maintain). */}
      <path
        d="M8.5 6.2 17 12l-8.5 5.8z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}
