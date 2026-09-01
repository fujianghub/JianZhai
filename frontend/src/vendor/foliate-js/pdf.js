// Stub for foliate-js's experimental PDF adapter. The upstream module pulls in
// its own vendored copy of PDF.js (``vendor/pdfjs/``), which 简斋 does not ship:
// PDFs render through ``PdfCanvas`` (pdfjs-dist) instead. ``view.js`` still
// contains a static ``import('./pdf.js')`` in its format sniffing, so this file
// exists only so the bundler can resolve it; it is never reached for EPUBs.
export const makePDF = async () => {
    throw new Error('PDF rendering via foliate-js is not bundled')
}
