/**
 * Paper colour for the PDF / PPT readers — the same five swatches the EPUB
 * reader offers (`EPUB_PAPERS`), one shared preference (`jz-pdf-paper:v1`).
 *
 * Light papers are painted by pdf.js itself (`page.render({ background })`,
 * so glyphs and images are untouched); the dark "夜墨" paper is a CSS invert
 * on the canvas only (`[data-paper=night] .jz-pdf-canvas`) — text and link
 * layers stay as they are. Images inside the PDF invert too; documented as a
 * known limitation until a real tone-mapping pass is worth it.
 */
import { useSyncExternalStore } from 'react';
import { EPUB_PAPERS, paperFor, type EpubPaper, type EpubPaperKey } from './epubReader';

export type ReaderPaperKey = EpubPaperKey;
export const READER_PAPERS: EpubPaper[] = EPUB_PAPERS;
export const READER_PAPER_KEY = 'jz-pdf-paper:v1';

const listeners = new Set<() => void>();

export function loadReaderPaper(): ReaderPaperKey {
  try {
    const v = localStorage.getItem(READER_PAPER_KEY);
    return (READER_PAPERS.some((p) => p.key === v) ? v : 'theme') as ReaderPaperKey;
  } catch {
    return 'theme';
  }
}

export function saveReaderPaper(key: ReaderPaperKey): void {
  try {
    localStorage.setItem(READER_PAPER_KEY, key);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === READER_PAPER_KEY) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** Current paper (re-renders on change, across tabs too). */
export function useReaderPaper(): [EpubPaper, (key: ReaderPaperKey) => void] {
  const key = useSyncExternalStore(subscribe, loadReaderPaper, () => 'theme' as ReaderPaperKey);
  return [paperFor(key), saveReaderPaper];
}

/** What to hand pdf.js as the canvas background for this paper. `null` keeps
 * the PDF's own (white) background — also for the dark paper, which is a CSS
 * filter on top. */
export function paperCanvasBackground(paper: EpubPaper): string | null {
  if (paper.key === 'theme' || paper.dark || !paper.bg) return null;
  return paper.bg;
}
