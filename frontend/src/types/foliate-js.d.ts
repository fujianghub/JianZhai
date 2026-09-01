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
    }): AsyncGenerator<FoliateSearchResult | 'done'>;
    clearSearch(): void;
    deselect(): void;
  }
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
  export class Overlayer {
    static highlight: (rects: DOMRect[], opts?: { color?: string }) => SVGElement;
    static underline: (rects: DOMRect[], opts?: { color?: string }) => SVGElement;
    static outline: (rects: DOMRect[], opts?: { color?: string }) => SVGElement;
  }
}
