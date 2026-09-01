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
