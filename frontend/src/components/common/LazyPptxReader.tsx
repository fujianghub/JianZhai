/**
 * Lazy wrapper around {@link PptxReader} — keeps the slide reader out of the
 * main blog chunk since most posts aren't presentations. Drop-in: same props.
 */
import { Suspense, lazy } from 'react';
import { Spin } from 'antd';
import type { Slide, SlideStatus } from '@/types';

const PptxReader = lazy(() => import('./PptxReader'));

interface Props {
  slides: Slide[];
  postId: number;
  downloadUrl?: string;
  status?: SlideStatus;
  error?: string;
  pollInterval?: number;
}

export default function LazyPptxReader(props: Props) {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spin />
        </div>
      }
    >
      <PptxReader {...props} />
    </Suspense>
  );
}
