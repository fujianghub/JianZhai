/**
 * What a PDF reader exposes to its outline/search/bookmark panel — the panel
 * lives either inside the reader (editor / attachment panel) or in the
 * reading page's own TOC rail / drawer (PostSidePanel), so the contract is a
 * plain object rather than component props.
 */
import type { Bookmark, Highlight } from '@/api/reading';
import type { PdfSearchHit } from './pdfTextIndex';
import type { SearchGroup } from '@/components/common/reader/SearchResults';

export type PdfSearchGroup = SearchGroup<PdfSearchHit>;

export interface PdfReaderApi {
  currentPage: number;
  pageCount: number;
  /** Stream hit groups (one per page) for `query`. */
  search: (query: string, push: (group: PdfSearchGroup) => void) => Promise<void>;
  clearSearch: () => void;
  jumpToHit: (hit: PdfSearchHit) => void;
  /** Index build progress while a first search is warming up (0–1). */
  indexProgress: number | null;
  bookmarks: Bookmark[];
  bookmarksLoaded: boolean;
  loggedIn: boolean;
  /** Whether the current page is bookmarked. */
  currentBookmark: Bookmark | null;
  toggleBookmark: () => Promise<void>;
  removeBookmark: (b: Bookmark) => Promise<void>;
  openBookmark: (b: Bookmark) => void;
  /** Per-user highlights / notes on this PDF (page-sorted). */
  highlights: Highlight[];
  highlightsLoaded: boolean;
  openHighlight: (h: Highlight) => void;
  openExport: () => void;
  /** Text of the current page ± 1 (AI context for a PDF has no body). */
  contextText: () => string;
}

export type PdfSideTab = 'toc' | 'search' | 'bookmarks' | 'notes';
