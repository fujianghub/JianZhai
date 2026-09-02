/**
 * Hand-written declarations for the vendored foliate-js modules 简斋 consumes
 * (``src/vendor/foliate-js/``). Upstream ships no types; only the surface used
 * by ``EpubReader`` is described here — extend as more of the API is adopted.
 */

declare module '@/vendor/foliate-js/view.js' {
  export interface FoliateTocItem {
    label: string;
    href?: string;
    subitems?: FoliateTocItem[];
    id?: number;
  }

  export interface FoliateSection {
    id: unknown;
    linear?: string;
    size: number;
    cfi?: string;
    load(): string | Promise<string>;
    unload?(): void;
    createDocument?(): Document | Promise<Document>;
  }

  export interface FoliateManifestItem {
    href: string;
    id: string;
    mediaType: string;
    properties?: string[];
  }

  export interface FoliateMetadata {
    title?: string | Record<string, string>;
    author?: unknown;
    language?: string | string[];
    description?: string;
    publisher?: unknown;
    published?: string;
    identifier?: string;
  }

  export interface FoliateBook {
    sections: FoliateSection[];
    dir?: 'ltr' | 'rtl';
    toc?: FoliateTocItem[];
    pageList?: FoliateTocItem[];
    landmarks?: Array<{ type?: string[]; href: string; label?: string }>;
    metadata?: FoliateMetadata;
    rendition?: { layout?: string };
    resources?: { manifest?: FoliateManifestItem[] };
    transformTarget?: EventTarget;
    getCover?(): Promise<Blob | null>;
    resolveHref(href: string): { index: number; anchor: (doc: Document) => Element | Range | null };
    isExternal?(href: string): boolean;
    destroy?(): void;
  }

  export interface FoliateRelocateDetail {
    fraction: number;
    section?: { current: number; total: number };
    location?: { current: number; next: number; total: number };
    time?: { section: number; total: number };
    tocItem?: FoliateTocItem | null;
    pageItem?: FoliateTocItem | null;
    cfi: string;
    range?: Range;
  }

  export interface FoliateRenderer extends HTMLElement {
    setStyles(styles: string | [string, string]): void;
    next(): Promise<void>;
    prev(): Promise<void>;
    prevSection?(): Promise<void>;
    nextSection?(): Promise<void>;
    firstSection?(): Promise<void>;
    lastSection?(): Promise<void>;
    /** Paginated mode: current page (1 = first content page) and total pages
     * including the two padding pages (content pages = ``pages - 2``). */
    readonly page?: number;
    readonly pages?: number;
    getContents(): Array<{ index: number; doc: Document; overlayer?: unknown }>;
    scrollToAnchor(anchor: Range | Element | number, select?: boolean): Promise<void>;
    readonly scrolled?: boolean;
    heads?: HTMLElement[] | null;
    feet?: HTMLElement[] | null;
  }

  export interface FoliateSearchResult {
    label?: string;
    subitems?: Array<{ cfi: string; excerpt: { pre: string; match: string; post: string } }>;
    progress?: number;
    cfi?: string;
    excerpt?: { pre: string; match: string; post: string };
  }

  export interface FoliateHistory extends EventTarget {
    readonly canGoBack: boolean;
    readonly canGoForward: boolean;
    back(): void;
    forward(): void;
    clear(): void;
  }

  export class View extends HTMLElement {
    book: FoliateBook;
    renderer: FoliateRenderer;
    /** Navigation history (TOC / link / search jumps); emits ``index-change``. */
    history: FoliateHistory;
    isFixedLayout: boolean;
    lastLocation: FoliateRelocateDetail | null;
    language: { canonical?: string; isCJK?: boolean; direction?: string };
    open(book: File | Blob | string | FoliateBook): Promise<void>;
    close(): void;
    init(opts: { lastLocation?: string | { fraction: number } | null; showTextStart?: boolean }): Promise<void>;
    goTo(target: string | number | { fraction: number }): Promise<{ index: number } | undefined>;
    goToFraction(fraction: number): Promise<void>;
    goToTextStart(): Promise<unknown>;
    goLeft(): Promise<void>;
    goRight(): Promise<void>;
    prev(distance?: number): Promise<void>;
    next(distance?: number): Promise<void>;
    getSectionFractions(): number[];
    search(opts: {
      query: string;
      index?: number;
      matchCase?: boolean;
      matchDiacritics?: boolean;
      matchWholeWords?: boolean;
      /** Overlay draw function for hits (default ``Overlayer.outline``). */
      draw?: FoliateDrawFn;
      drawOptions?: Record<string, unknown>;
    }): AsyncGenerator<FoliateSearchResult | 'done'>;
    clearSearch(): void;
    deselect(): void;
    /* ── Annotations (overlayer) ─────────────────────────────────────── */
    /** Draw ``annotation`` when its section is the rendered one; the host
     * picks the drawing in a ``draw-annotation`` listener. Returns the
     * section index + TOC label. No-op (except the return) for other
     * sections — replay from ``create-overlay``. */
    addAnnotation(annotation: FoliateAnnotation, remove?: boolean): Promise<{ index: number; label: string }>;
    deleteAnnotation(annotation: FoliateAnnotation): Promise<{ index: number; label: string }>;
    /** Navigate to the annotation and re-emit ``show-annotation``. */
    showAnnotation(annotation: FoliateAnnotation): Promise<void>;
    /** Range CFI for a DOM range inside section ``index`` (section CFI when
     * ``range`` is omitted). */
    getCFI(index: number, range?: Range): string;
    resolveCFI(cfi: string): { index: number; anchor: (doc: Document) => Range | Element | null };
    resolveNavigation(target: string | number | { fraction: number }): Promise<{ index: number; anchor: (doc: Document) => Range | Element | null }>;
    /** Navigate and turn the target into a live DOM selection. */
    select(target: string): Promise<void>;
    /** TOC / page-list entries covering ``range`` in section ``index``. */
    getProgressOf(index: number, range?: Range): { tocItem?: FoliateTocItem | null; pageItem?: FoliateTocItem | null };
  }

  /** Host-defined annotation object; only ``value`` (a CFI, also the overlay
   * key) is required — everything else is passed through untouched. */
  export interface FoliateAnnotation {
    value: string;
    [key: string]: unknown;
  }
  export type FoliateDrawFn = (rects: DOMRect[] | DOMRectList, options?: Record<string, unknown>) => SVGElement;
  export interface FoliateDrawAnnotationDetail {
    draw: (fn: FoliateDrawFn, options?: Record<string, unknown>) => void;
    annotation: FoliateAnnotation;
    doc: Document;
    range: Range;
  }
  export interface FoliateShowAnnotationDetail {
    value: string;
    index: number;
    range: Range;
  }
}

declare module '@/vendor/foliate-js/epubcfi.js' {
  /** Total order over CFIs (reading order); works for range CFIs. */
  export function compare(a: string, b: string): number;
  /** Range CFI → start (or end) point CFI. */
  export function collapse(cfi: string, toEnd?: boolean): string;
  export function fromRange(range: Range, filter?: (node: Node) => number): string;
  export const isCFI: RegExp;
}

declare module '@/vendor/foliate-js/footnotes.js' {
  import type { FoliateBook, View } from '@/vendor/foliate-js/view.js';

  export interface FootnoteRenderDetail {
    view: View;
    href: string;
    type: string | null;
    /** True when the target is an ``<aside epub:type="footnote">`` the
     * publisher hides from the main flow (i.e. a genuine pop-up note). */
    hidden: boolean;
    target: Element | Range | null;
  }

  export class FootnoteHandler extends EventTarget {
    detectFootnotes: boolean;
    handle(book: FoliateBook, e: CustomEvent): Promise<void> | undefined;
  }
}

declare module '@/vendor/foliate-js/overlayer.js' {
  type Rects = DOMRect[] | DOMRectList;
  export class Overlayer {
    static highlight: (rects: Rects, opts?: { color?: string }) => SVGElement;
    static underline: (rects: Rects, opts?: { color?: string; width?: number; writingMode?: string }) => SVGElement;
    static strikethrough: (rects: Rects, opts?: { color?: string; width?: number; writingMode?: string }) => SVGElement;
    static squiggly: (rects: Rects, opts?: { color?: string; width?: number; writingMode?: string }) => SVGElement;
    static outline: (rects: Rects, opts?: { color?: string; width?: number; radius?: number }) => SVGElement;
    readonly element: SVGSVGElement;
    add(key: string, range: Range | ((root: Node) => Range), draw: (rects: Rects, opts?: Record<string, unknown>) => SVGElement, options?: Record<string, unknown>): void;
    remove(key: string): void;
    redraw(): void;
    hitTest(point: { x: number; y: number }): [string, Range] | [];
  }
}
