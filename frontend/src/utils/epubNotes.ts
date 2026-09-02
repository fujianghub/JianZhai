/**
 * Pure helpers for EPUB highlights / notes: the colour palette shared by the
 * overlay, the selection bar and the notes list; reading-order sorting by
 * CFI; and the Markdown shapes used by "引用为 Markdown" and "导出笔记".
 *
 * Nothing here touches the DOM or the network, so it is unit-tested directly.
 */
import { compare as compareCfi } from '@/vendor/foliate-js/epubcfi.js';
import type { Highlight, HighlightColor } from '@/api/reading';

export interface HighlightSwatch {
  key: HighlightColor;
  label: string;
  /** Marker colour drawn by the overlayer (multiply on light paper, screen on
   * dark) and used as the swatch / list bar colour. */
  hex: string;
}

export const HIGHLIGHT_SWATCHES: HighlightSwatch[] = [
  { key: 'yellow', label: '黄', hex: '#ffd21f' },
  { key: 'green', label: '绿', hex: '#4cd964' },
  { key: 'blue', label: '蓝', hex: '#4da3ff' },
  { key: 'pink', label: '粉', hex: '#ff6b9a' },
  { key: 'purple', label: '紫', hex: '#b07cff' },
];

export function swatchHex(color: string): string {
  return HIGHLIGHT_SWATCHES.find((s) => s.key === color)?.hex ?? HIGHLIGHT_SWATCHES[0].hex;
}

const LAST_COLOR_KEY = 'jz-epub-hl-color';

export function loadLastHighlightColor(): HighlightColor {
  try {
    const v = localStorage.getItem(LAST_COLOR_KEY);
    if (v && HIGHLIGHT_SWATCHES.some((s) => s.key === v)) return v as HighlightColor;
  } catch {
    /* storage unavailable */
  }
  return 'yellow';
}

export function saveLastHighlightColor(color: HighlightColor): void {
  try {
    localStorage.setItem(LAST_COLOR_KEY, color);
  } catch {
    /* ignore */
  }
}

/** Selection text as stored: whitespace collapsed, capped at the model limit. */
export const HIGHLIGHT_TEXT_MAX = 2000;
export function normalizeSelectionText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, HIGHLIGHT_TEXT_MAX);
}

/** Reading order. Unparsable CFIs sort last (stable). */
export function sortHighlights<T extends { cfi: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    try {
      return compareCfi(a.cfi, b.cfi);
    } catch {
      return 0;
    }
  });
}

export interface HighlightGroup<T> {
  chapter: string;
  items: T[];
}

/** Group an already-sorted list by chapter label, keeping reading order
 * (a chapter that appears twice non-contiguously stays two groups — that's
 * what the reader sees while paging). */
export function groupByChapter<T extends { chapter: string }>(sorted: T[]): HighlightGroup<T>[] {
  const out: HighlightGroup<T>[] = [];
  for (const h of sorted) {
    const last = out[out.length - 1];
    if (last && last.chapter === h.chapter) last.items.push(h);
    else out.push({ chapter: h.chapter, items: [h] });
  }
  return out;
}

/** Deep link that opens the book at ``cfi`` (resolves for readers and authors
 * alike; ``/d/:id`` forwards the query). */
export function docCfiHref(docId: number, cfi: string): string {
  return `/d/${docId}?cfi=${encodeURIComponent(cfi)}`;
}

/** Deep link to a Markdown highlight (re-anchored + flashed on arrival). */
export function docHlHref(docId: number, hlId: number): string {
  return `/d/${docId}?hl=${hlId}`;
}

export interface QuoteSource {
  title: string;
  author?: string;
  chapter?: string;
  docId?: number | null;
  cfi?: string;
  /** Markdown highlight id — used for the back link when there is no CFI. */
  hlId?: number;
}

function backHref(src: QuoteSource): string | null {
  if (!src.docId) return null;
  if (src.cfi) return docCfiHref(src.docId, src.cfi);
  if (src.hlId) return docHlHref(src.docId, src.hlId);
  return null;
}

function attribution(src: QuoteSource): string {
  const parts = [`《${src.title || '未命名'}》`];
  if (src.author) parts.push(src.author);
  if (src.chapter) parts.push(src.chapter);
  const href = backHref(src);
  if (href) parts.push(`[回到原文](${href})`);
  return parts.join(' · ');
}

/** ``> quote`` block + attribution line, for pasting into a note. */
export function buildQuoteMarkdown(text: string, src: QuoteSource): string {
  const body = normalizeSelectionText(text)
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
  return `${body}\n> —— ${attribution(src)}`;
}

export interface NotesExportSource {
  title: string;
  author?: string;
  docId?: number | null;
  highlights: Highlight[];
  /** For the header line; defaults to ``new Date()``. */
  now?: Date;
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** One Markdown document: H1 title, H2 per chapter (reading order), each
 * highlight as a quote block, its note as a paragraph, and a back link. */
export function buildNotesMarkdown(src: NotesExportSource): string {
  const sorted = sortHighlights(src.highlights);
  const lines: string[] = [];
  lines.push(`# 《${src.title || '未命名'}》读书笔记`);
  lines.push('');
  const meta = [src.author ? `作者：${src.author}` : '', `导出于 ${fmtDate(src.now ?? new Date())}`, `${sorted.length} 条划线`].filter(Boolean);
  lines.push(meta.join(' · '));
  if (src.docId) lines.push('', `原书：[《${src.title || '未命名'}》](/d/${src.docId})`);
  for (const g of groupByChapter(sorted)) {
    lines.push('', `## ${g.chapter || '（正文）'}`);
    for (const h of g.items) {
      lines.push('');
      const quote = normalizeSelectionText(h.text) || '（无引文）';
      lines.push(`> ${quote}`);
      const href = h.cfi ? (src.docId ? docCfiHref(src.docId, h.cfi) : null) : src.docId ? docHlHref(src.docId, h.id) : null;
      if (href) lines.push(`> —— [回到原文](${href})`);
      if (h.note.trim()) {
        lines.push('');
        lines.push(h.note.trim());
      }
    }
  }
  lines.push('');
  return lines.join('\n');
}

/** Body for "发到评论": the quote then the note. */
export function buildCommentFromHighlight(h: Pick<Highlight, 'text' | 'note' | 'chapter'>): string {
  const quote = normalizeSelectionText(h.text);
  const head = quote ? `> ${quote}${h.chapter ? `\n> —— ${h.chapter}` : ''}` : '';
  const note = h.note.trim();
  return [head, note].filter(Boolean).join('\n\n');
}

/** File name for the downloaded notes. */
export function notesFilename(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60);
  return safe ? `${safe}-读书笔记.md` : '读书笔记.md';
}
