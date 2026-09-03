import type { DocFormat } from '@/types';

const META: Record<DocFormat, { label: string; color: string }> = {
  // Each pill renders with the same shape; only the accent colour varies —
  // seven ``--jz-fmt-*`` tokens in tokens.css (theme-stable hexes), tinted
  // backgrounds + bold text are computed with color-mix in CSS.
  markdown: { label: 'MD', color: 'var(--jz-fmt-markdown)' },
  html: { label: 'HTML', color: 'var(--jz-fmt-html)' },
  pdf: { label: 'PDF', color: 'var(--jz-fmt-pdf)' },
  docx: { label: 'DOCX', color: 'var(--jz-fmt-docx)' },
  pptx: { label: 'PPT', color: 'var(--jz-fmt-pptx)' },
  epub: { label: 'EPUB', color: 'var(--jz-fmt-epub)' },
  image: { label: '图片', color: 'var(--jz-fmt-image)' },
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
