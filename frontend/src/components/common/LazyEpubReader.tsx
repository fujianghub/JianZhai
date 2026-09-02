/**
 * Lazy wrapper around {@link EpubReader}.
 *
 * ``EpubReader`` statically imports the vendored foliate-js entry (which in
 * turn pulls zip.js + the EPUB parser + paginator as its own chunks), so any
 * eager importer would drag ~300KB of reader code into its bundle. Loading it
 * via ``React.lazy`` keeps all of that in a chunk that downloads only when an
 * EPUB attachment is actually rendered. Drop-in replacement: same props.
 */
import { Suspense, lazy } from 'react';
import { Spin } from 'antd';

const EpubReader = lazy(() => import('./EpubReader'));

interface Props {
  url: string;
  height?: number | string;
  scroll?: 'inner' | 'page';
  title?: string;
  documentId?: number | null;
  initialCfi?: string | null;
  kbSlug?: string | null;
}

export default function LazyEpubReader(props: Props) {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin />
        </div>
      }
    >
      <EpubReader {...props} />
    </Suspense>
  );
}
