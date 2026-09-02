# foliate-js (vendored)

- Upstream: https://github.com/johnfactotum/foliate-js (MIT — see `LICENSE`)
- Pinned commit: `78914aef4466eb960965702401634c2cb348e9b1` (2026-05-01)
- Why vendored: upstream publishes no npm release and recommends a git
  submodule; the `foliate-js` package on npm is a third-party upload. Pinning a
  commit here keeps the build reproducible (the API is self-described as
  unstable).

## What is included

Only the modules `view.js` reaches (statically or via dynamic `import()`), so the
bundler can resolve every branch:

| file | role |
|---|---|
| `view.js` | `<foliate-view>` custom element — the entry point |
| `epub.js`, `epubcfi.js` | EPUB container/OPF/NCX/nav parsing, CFI |
| `paginator.js`, `fixed-layout.js` | reflowable (CSS multi-column) / FXL renderers |
| `progress.js`, `overlayer.js`, `search.js`, `text-walker.js`, `footnotes.js` | progress, highlight overlay, search, pop-up footnotes |
| `comic-book.js`, `fb2.js`, `mobi.js`, `tts.js` | other formats / TTS (lazy branches of `view.js`; never loaded for EPUB) |
| `vendor/zip.js`, `vendor/fflate.js` | upstream's vendored zip / inflate |
| `pdf.js` | **local stub** — upstream's PDF adapter needs its own PDF.js copy; 简斋 renders PDFs with `PdfCanvas` |

Not included: `reader.html/js`, `ui/`, `dict.js`, `opds.js`, `uri-template.js`,
`quote-image.js`, `tests/`, `rollup/`, `vendor/pdfjs/`.

## Local modifications

- `paginator.js` → `setStylesImportant`: added `if (!el) return`. The
  paginator's ResizeObserver can call `render()` while a just-created chapter
  iframe is still parsing (`documentElement` / `body` null); upstream throws
  "Cannot destructure property 'style' of 'el'" from the observer callback.
  Harmless (the pending `load` re-renders) but it surfaces as an uncaught page
  error, so it is skipped. Re-apply when updating.
- `paginator.js` → `#afterScroll` / `#scrollTo` / new `#fractionAnchor`
  (2026-09-02, "EPUB jumps on its own" fix). Two upstream quirks that only
  show up when the stage or chapter changes size (full-screen chrome toggle,
  sidebar resize, focus mode, late image loads, `fonts.ready`):
  1. `getVisibleRange` finds no node when the viewport holds no text (cover,
     a figure taller than the viewport) and returns a collapsed range at
     `body` start; `#afterScroll` stored that as the anchor, so the next
     relayout scrolled back to the chapter start. Patched: in scrolled flow
     the anchor becomes `{ element, delta }` (`#elementAnchor` — innermost
     element under the viewport top + pixel offset into it, resolved by
     `#scrollToAnchor`; survives the chapter growing above or below like the
     browser's own scroll anchoring), in paginated flow a fraction
     (`#fractionAnchor`).
  2. `#afterScroll` armed `#justAnchored` after every programmatic anchoring,
     but `#scrollTo` returns early (no `scroll` event) when the offset is
     unchanged, so the flag stayed set and swallowed the user's *next* scroll
     (anchor left stale → the following relayout jumped back). `#afterScroll`
     now takes `willScroll` and the early-return path passes `false`.
  Re-apply both when updating; the app-side half of the fix is
  `styles/reader.css` (full-screen toolbar is a pure overlay, never changes
  `.jz-epub-body` padding).
- `pdf.js` is replaced by the stub above. TypeScript
declarations live in `src/types/foliate-js.d.ts` (hand-written for the parts
简斋 uses); the React wrapper is `src/components/common/EpubReader.tsx`.

## Updating

```
git clone --depth 1 https://github.com/johnfactotum/foliate-js /tmp/foliate-js
cp /tmp/foliate-js/{view,epub,epubcfi,paginator,fixed-layout,progress,overlayer,search,text-walker,footnotes,comic-book,fb2,mobi,tts}.js src/vendor/foliate-js/
cp /tmp/foliate-js/vendor/{zip,fflate}.js src/vendor/foliate-js/vendor/
```

Then bump the commit hash above, re-run `pnpm test` / `tsc` and the EPUB
Playwright smoke (paginated/scrolled, TOC, theme injection, position restore).

## Security note

EPUBs can carry scripts. Chapters render in `blob:` iframes on the site origin,
and iframe `sandbox` cannot block them (WebKit bug 218086 forces
`allow-scripts`). Defence is therefore (1) the backend strips scripts/event
handlers at upload (`apps/editor/services/epub_sanitize.py`), (2) the reader
strips again at load via `transformTarget`, and (3) production Caddy sends a
`script-src 'self'` CSP which `blob:` documents inherit.
