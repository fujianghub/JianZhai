import type { DocFormat } from '@/types';

const META: Record<DocFormat, { label: string; color: string }> = {
  // Each pill renders with the same shape; only the accent colour varies. The
  // values stay as raw hex so the pill is recognisable across all 4 themes —
  // tinted backgrounds + bold text are computed with color-mix in CSS.
  markdown: { label: 'MD', color: '#3b82f6' },
  html: { label: 'HTML', color: '#f97316' },
  pdf: { label: 'PDF', color: '#ef4444' },
  docx: { label: 'DOCX', color: '#6366f1' },
  image: { label: '图片', color: '#a78bfa' },
};

interface Props {
  format: DocFormat | undefined | null;
  size?: 'small' | 'default';
}

/** Coloured pill that shows whether a document is markdown / pdf / html / docx / image. */
export default function DocFormatTag({ format, size = 'small' }: Props) {
  if (!format) return null;
  const meta = META[format] ?? META.markdown;
  return (
    <span
      className={'jz-format-pill ' + (size === 'small' ? 'jz-format-pill-sm' : '')}
      style={{ ['--jz-fmt-c' as string]: meta.color } as React.CSSProperties}
    >
      {meta.label}
    </span>
  );
}

export function formatLabel(format: DocFormat | undefined | null): string {
  if (!format) return '';
  return (META[format] ?? META.markdown).label;
}
