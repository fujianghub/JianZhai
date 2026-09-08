/**
 * Server-side reading position for one document (cross-device resume).
 *
 * `remote` is the row fetched on mount (null when none / signed out),
 * `loaded` flips once that fetch settled, `push` queues a debounced PUT
 * (5 s after the last change, flushed on tab hide / unload / unmount with
 * `fetch keepalive`), and `waitRemote` is for readers that must know the
 * server position before they can open at all (EPUB's `view.init`). See
 * utils/positionSync.ts for the merge rule.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureCsrf } from '@/api/client';
import { getReadingPosition, putReadingPosition, type ReadingPositionInput, type ReadingPositionRecord } from '@/api/reading';
import { createDebouncedPusher, type DebouncedPusher } from '@/utils/positionSync';

export const POSITION_PUSH_DELAY_MS = 5000;

interface Deferred {
  promise: Promise<ReadingPositionRecord | null>;
  resolve: (v: ReadingPositionRecord | null) => void;
}

function deferred(): Deferred {
  let resolve: Deferred['resolve'] = () => undefined;
  const promise = new Promise<ReadingPositionRecord | null>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export function useServerPosition(documentId: number | null | undefined, enabled: boolean) {
  const active = enabled && !!documentId;
  const [remote, setRemote] = useState<ReadingPositionRecord | null>(null);
  const [loaded, setLoaded] = useState(!active);
  const waiterRef = useRef<Deferred | null>(null);
  const pusherRef = useRef<DebouncedPusher<ReadingPositionInput> | null>(null);

  useEffect(() => {
    setRemote(null);
    const d = deferred();
    waiterRef.current = d;
    if (!active || !documentId) {
      setLoaded(true);
      d.resolve(null);
      return;
    }
    setLoaded(false);
    let cancelled = false;
    // The unload-time flush uses fetch keepalive and cannot fetch a CSRF
    // token then — make sure the cookie exists while the page is alive.
    void ensureCsrf().catch(() => undefined);
    getReadingPosition(documentId)
      .then((rec) => {
        if (cancelled) return;
        setRemote(rec);
        setLoaded(true);
        d.resolve(rec);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
        d.resolve(null);
      });
    const pusher = createDebouncedPusher<ReadingPositionInput>(
      (body, keepalive) => putReadingPosition(documentId, body, { keepalive }).catch(() => undefined),
      POSITION_PUSH_DELAY_MS,
    );
    pusherRef.current = pusher;
    const onHide = () => {
      if (document.visibilityState === 'hidden') pusher.flush(true);
    };
    const onPageHide = () => pusher.flush(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      pusher.dispose();
      if (pusherRef.current === pusher) pusherRef.current = null;
    };
  }, [active, documentId]);

  const push = useCallback((body: ReadingPositionInput) => {
    pusherRef.current?.push(body);
  }, []);
  const waitRemote = useCallback(() => waiterRef.current?.promise ?? Promise.resolve(null), []);

  return { remote, loaded, push, waitRemote };
}
