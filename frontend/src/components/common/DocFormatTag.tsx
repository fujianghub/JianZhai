import { Tag } from 'antd';
import type { DocFormat } from '@/types';

const META: Record<DocFormat, { label: string; color: string }> = {
  markdown: { label: 'MD', color: 'blue' },
  html: { label: 'HTML', color: 'orange' },
  pdf: { label: 'PDF', color: 'red' },
  docx: { label: 'DOCX', color: 'geekblue' },
  image: { label: '图片', color: 'purple' },
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
    <Tag
      color={meta.color}
      style={{
        marginInlineEnd: 0,
        fontSize: size === 'small' ? 10 : 12,
        lineHeight: '16px',
        padding: '0 6px',
      }}
    >
      {meta.label}
    </Tag>
  );
}

export function formatLabel(format: DocFormat | undefined | null): string {
  if (!format) return '';
  return (META[format] ?? META.markdown).label;
}
