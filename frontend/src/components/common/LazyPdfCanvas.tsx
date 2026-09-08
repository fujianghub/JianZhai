/**
 * Lazy wrapper around {@link PdfCanvas}.
 *
 * ``PdfCanvas`` statically imports the whole of ``pdfjs-dist`` (and sets the
 * worker at module load), so any component that imports it eagerly drags the
 * ~1MB parser into its chunk — even when no PDF is ever shown. Loading it via
 * ``React.lazy`` keeps pdfjs in its own chunk that downloads only when a PDF
 * attachment is actually rendered. Drop-in replacement: same props.
 */
import { Suspense, lazy } from 'react';
import { Spin } from 'antd';
import type { PdfTocEntry } from '@/utils/pdfOutline';
import type { PdfReaderApi, PdfSideTab } from '@/utils/pdfReaderApi';

const PdfCanvas = lazy(() => import('./PdfCanvas'));

interface Props {
  url: string;
  height?: number | string;
  scroll?: 'inner' | 'page';
  /** 1-based page to open on (``?page=`` deep link); wins over the memory. */
  initialPage?: number | null;
  /** Mirror the current page into ``?page=`` (reading page only). */
  syncUrl?: boolean;
  onOutline?: (entries: PdfTocEntry[]) => void;
  onPageChange?: (page: number, pageCount: number) => void;
  jumpRef?: React.MutableRefObject<((entry: PdfTocEntry) => void) | null>;
  documentId?: number | null;
  onReaderApi?: (api: PdfReaderApi) => void;
  onTabRequest?: (tab: PdfSideTab) => void;
  initialHlId?: number | null;
  docTitle?: string;
  canCreateDoc?: boolean;
}

export default function LazyPdfCanvas(props: Props) {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin />
        </div>
      }
    >
      <PdfCanvas {...props} />
    </Suspense>
  );
}
