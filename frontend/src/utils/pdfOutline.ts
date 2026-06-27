/**
 * Parse a PDF's embedded outline (bookmarks) into a flat, level-tagged list
 * suitable for a table-of-contents sidebar.
 *
 * pdf.js exposes `doc.getOutline()` as a nested tree whose leaves carry a
 * `dest` that points somewhere into the document. We flatten the tree (keeping
 * the nesting depth as `level`) and resolve each `dest` to a 1-based page
 * number so a click can jump the canvas renderer straight to that page.
 *
 * A `dest` comes in two shapes:
 *   - a named destination (string) → resolve via `doc.getDestination(name)`
 *   - an explicit array `[pageRef, {name:'XYZ'}, x, y, z]` → the first element
 *     is a page reference resolved via `doc.getPageIndex(ref)`
 * Anything we cannot resolve keeps `page = null` (still listed, but inert).
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface PdfTocEntry {
  /** Bookmark label. */
  title: string;
  /** Nesting depth, 1-based (top-level bookmarks are level 1). */
  level: number;
  /** 1-based target page, or null when the destination can't be resolved. */
  page: number | null;
  /** Stable unique key (path of indices) for React keys + active tracking. */
  key: string;
}

// pdf.js doesn't ship precise types for outline nodes; describe what we use.
interface RawOutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items?: RawOutlineNode[];
}

async function resolvePage(
  doc: PDFDocumentProxy,
  dest: string | unknown[] | null,
): Promise<number | null> {
  try {
    if (!dest) return null;
    // Named destinations resolve to an explicit array first.
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const ref = explicit[0];
    // ref is a page reference object {num, gen}; getPageIndex → 0-based index.
    const index = await doc.getPageIndex(ref as Parameters<typeof doc.getPageIndex>[0]);
    return index + 1;
  } catch {
    return null;
  }
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
  // Depth-first flatten, resolving each node's page along the way.
  const walk = async (nodes: RawOutlineNode[], level: number, prefix: string) => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const key = `${prefix}${i}`;
      const title = (node.title || '').trim();
      const page = await resolvePage(doc, node.dest ?? null);
      if (title) out.push({ title, level, page, key });
      if (node.items && node.items.length > 0) {
        await walk(node.items, level + 1, `${key}.`);
      }
    }
  };
  await walk(tree, 1, '');
  return out;
}
