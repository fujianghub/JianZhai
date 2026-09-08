/**
 * Parse a PDF's embedded outline (bookmarks) into a flat, level-tagged list
 * suitable for a table-of-contents sidebar.
 *
 * pdf.js exposes `doc.getOutline()` as a nested tree whose leaves carry a
 * `dest` that points somewhere into the document. We flatten the tree (keeping
 * the nesting depth as `level`) and resolve each `dest` through
 * {@link resolveDest} to a 1-based page number plus the in-page position
 * (`top`/`left`, PDF user space) so a click can land exactly where the
 * bookmark points instead of only at the page top.
 * Anything we cannot resolve keeps `page = null` (still listed, but inert).
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { resolveDest, type RawPdfDest } from './pdfDest';

export interface PdfTocEntry {
  /** Bookmark label. */
  title: string;
  /** Nesting depth, 1-based (top-level bookmarks are level 1). */
  level: number;
  /** 1-based target page, or null when the destination can't be resolved. */
  page: number | null;
  /** Vertical target inside the page (PDF user space), null = page top. */
  top: number | null;
  /** Horizontal target inside the page (PDF user space), null when absent. */
  left: number | null;
  /** Stable unique key (path of indices) for React keys + active tracking. */
  key: string;
}

// pdf.js doesn't ship precise types for outline nodes; describe what we use.
interface RawOutlineNode {
  title: string;
  dest: RawPdfDest;
  items?: RawOutlineNode[];
}

export async function getPdfOutline(doc: PDFDocumentProxy): Promise<PdfTocEntry[]> {
  let tree: RawOutlineNode[] | null = null;
  try {
    tree = (await doc.getOutline()) as RawOutlineNode[] | null;
  } catch {
    return [];
  }
  if (!tree || tree.length === 0) return [];

  const out: PdfTocEntry[] = [];
  // Depth-first flatten, resolving each node's destination along the way.
  const walk = async (nodes: RawOutlineNode[], level: number, prefix: string) => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const key = `${prefix}${i}`;
      const title = (node.title || '').trim();
      const dest = await resolveDest(doc, node.dest ?? null);
      if (title) {
        out.push({
          title,
          level,
          page: dest?.page ?? null,
          top: dest?.top ?? null,
          left: dest?.left ?? null,
          key,
        });
      }
      if (node.items && node.items.length > 0) {
        await walk(node.items, level + 1, `${key}.`);
      }
    }
  };
  await walk(tree, 1, '');
  return out;
}
