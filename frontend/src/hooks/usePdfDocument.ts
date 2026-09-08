/**
 * Load a PDF through pdf.js and expose the document handle plus the size of
 * page 1 (which seeds placeholder aspect ratios). Shared by the continuous
 * reader (PdfCanvas) and the PPT reader (its derived slide PDF).
 *
 * Loading strategy (2026-09-08, batch 1): hand pdf.js the *URL* and let it
 * fetch with HTTP Range requests (`rangeChunkSize`, `disableAutoFetch`) so a
 * 1 GB scanned book paints page 1 after a few hundred KB instead of a full
 * download, and each chunk is a plain same-origin GET the browser can cache
 * (Caddy marks /media/uploads immutable; the dev server answers 206 via
 * apps/editor/media_views). Servers without Range support make pdf.js fall
 * back to one whole-file fetch — a safe degradation.
 *
 * History: this used to fetch the bytes itself with a per-mount `?_=` nonce
 * to dodge empty/204 responses from the Vite proxy. The real cause (http-proxy
 * keep-alive reusing a half-drained socket) is fixed in vite.config.ts
 * (`freshSocketAgent`), and the nonce made every visit re-download the whole
 * file. The nonce now only rides an explicit user `reload()`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { buildPdfLoadOptions, describePdfLoadError } from '@/utils/pdfLoad';

export { buildPdfLoadOptions, describePdfLoadError, PDF_RANGE_CHUNK } from '@/utils/pdfLoad';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface PdfDocumentState {
  doc: pdfjs.PDFDocumentProxy | null;
  pageCount: number;
  /** Page 1's intrinsic size at scale 1 (CSS px per PDF unit = 1). */
  baseSize: { w: number; h: number } | null;
  loading: boolean;
  error: string | null;
  /** 0–99 while bytes are streaming in (null when unknown / not loading). */
  progress: number | null;
  /** Force a fresh fetch (cache-busting) — wired to the "重试" button. */
  reload: () => void;
  /** Set while pdf.js waits for a password (user-encrypted file). `wrong`
   * is true after a rejected attempt. */
  passwordPrompt: { wrong: boolean } | null;
  submitPassword: (password: string) => void;
}

const IDLE = { doc: null, pageCount: 0, baseSize: null, loading: false, error: null, progress: null } as const;

export function usePdfDocument(url: string | null | undefined): PdfDocumentState {
  const [state, setState] = useState<Omit<PdfDocumentState, 'reload' | 'passwordPrompt' | 'submitPassword'>>(
    url ? { ...IDLE, loading: true } : IDLE,
  );
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const [passwordPrompt, setPasswordPrompt] = useState<{ wrong: boolean } | null>(null);
  const passwordCbRef = useRef<((pw: string) => void) | null>(null);
  const submitPassword = useCallback((pw: string) => {
    passwordCbRef.current?.(pw);
    setPasswordPrompt(null);
  }, []);

  useEffect(() => {
    if (!url) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    setState({ ...IDLE, loading: true });
    const loadingTask = pdfjs.getDocument(buildPdfLoadOptions(url, { bust: attempt > 0 }));
    // User-password PDFs: pdf.js pauses and asks; we surface a prompt and hand
    // the answer back (NEED_PASSWORD = 1, INCORRECT_PASSWORD = 2).
    loadingTask.onPassword = (cb: (pw: string) => void, reason: number) => {
      if (cancelled) return;
      passwordCbRef.current = cb;
      setPasswordPrompt({ wrong: reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD });
    };
    loadingTask.onProgress = ({ loaded, total }: { loaded: number; total?: number }) => {
      if (cancelled || !total) return;
      const pct = Math.min(99, Math.round((loaded / total) * 100));
      setState((s) => (s.loading ? { ...s, progress: pct } : s));
    };
    (async () => {
      try {
        const d = await loadingTask.promise;
        if (cancelled) return;
        // Page 1's size seeds every placeholder's aspect ratio (most PDFs are
        // uniform; a per-page mismatch is corrected when that page renders).
        const first = await d.getPage(1);
        if (cancelled) return;
        const vp = first.getViewport({ scale: 1 });
        setState({
          doc: d,
          pageCount: d.numPages,
          baseSize: { w: vp.width, h: vp.height },
          loading: false,
          error: null,
          progress: null,
        });
      } catch (e: unknown) {
        if (cancelled) return;
        setState({ ...IDLE, error: describePdfLoadError(e) });
      }
    })();
    return () => {
      cancelled = true;
      passwordCbRef.current = null;
      setPasswordPrompt(null);
      // Destroys the worker-side document too (the proxy we handed out is
      // invalid after this — consumers key their effects on `doc`).
      void loadingTask.destroy().catch(() => {});
    };
  }, [url, attempt]);

  return { ...state, reload, passwordPrompt, submitPassword };
}
