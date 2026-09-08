/**
 * Knowledge-base directory helpers for the blog side (2026-09-02, 批次 B):
 * flattening the public KB tree into the shared dot-path shape the tree
 * helpers in ``treeToc.ts`` operate on, per-KB fold state for the landing page's folder sections, and grouping the
 * KB list by 大类 (category).
 */
import type { PublicFolder, PublicKB, PublicPost } from '@/types';

export interface KbTocEntry {
  key: string;
  title: string;
  /** 1-based depth (folders and docs alike). */
  level: number;
  kind: 'folder' | 'doc';
  folderId?: number;
  /** Docs in this folder's whole subtree (folder rows). */
  count?: number;
  tags?: PublicFolder['tags'];
  doc?: PublicPost;
}

/** Docs in a folder subtree. */
export function countFolderDocs(f: PublicFolder): number {
  return f.documents.length + f.children.reduce((s, c) => s + countFolderDocs(c), 0);
}

/** Flatten the public KB tree in render order (per level: docs first, then
 * subfolders — mirrors the original PublicKbFolderTree). Keys are dot-paths
 * so ``treeToc.ts``'s expansion/filter helpers apply unchanged. */
export function flattenKbTree(folders: PublicFolder[], rootDocuments: PublicPost[]): KbTocEntry[] {
  const out: KbTocEntry[] = [];
  const walkFolder = (f: PublicFolder, key: string, level: number) => {
    out.push({
      key,
      title: f.name,
      level,
      kind: 'folder',
      folderId: f.id,
      count: countFolderDocs(f),
      tags: f.tags,
    });
    let i = 0;
    for (const d of f.documents) out.push(docEntry(d, `${key}.${i++}`, level + 1));
    for (const c of f.children) walkFolder(c, `${key}.${i++}`, level + 1);
  };
  const docEntry = (d: PublicPost, key: string, level: number): KbTocEntry => ({
    key,
    title: d.title,
    level,
    kind: 'doc',
    doc: d,
  });
  let i = 0;
  for (const f of folders) walkFolder(f, String(i++), 1);
  for (const d of rootDocuments) out.push(docEntry(d, String(i++), 1));
  return out;
}

/* TOC presentation prefs (KB tree = scope ``kb``, the rail's 知识库 list =
   scope ``kblist``) live in ``utils/tocPrefs.ts`` — site defaults from
   /admin/toc + local overrides via ``useTocPrefs(scope)``. */

/* ── Landing-page folder-section folds (per KB) ────────────────────────── */

const foldsKey = (slug: string) => `jz-kb-folds-v1:${slug}`;

/** Collapsed folder ids for a KB's landing page (default: none collapsed). */
export function loadKbFolds(slug: string): Set<number> {
  try {
    const raw = localStorage.getItem(foldsKey(slug));
    const arr = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is number => typeof x === 'number'));
  } catch {
    /* ignore */
  }
  return new Set();
}

export function saveKbFolds(slug: string, collapsed: Set<number>): void {
  try {
    localStorage.setItem(foldsKey(slug), JSON.stringify([...collapsed]));
  } catch {
    /* ignore */
  }
}

/* ── KB list grouped by 大类 ───────────────────────────────────────────── */

export interface KbCategoryGroup {
  /** null = 未分类 (sorted last). */
  category: PublicKB['category'];
  kbs: PublicKB[];
}

/** Group the public KB list by category, categories in (order, id) order,
 * uncategorised last; KBs inside a group keep the caller's ordering. */
export function groupKbsByCategory(kbs: PublicKB[]): KbCategoryGroup[] {
  const map = new Map<number | null, KbCategoryGroup>();
  for (const kb of kbs) {
    const id = kb.category?.id ?? null;
    const g = map.get(id) ?? { category: kb.category ?? null, kbs: [] };
    g.kbs.push(kb);
    map.set(id, g);
  }
  return [...map.values()].sort((a, b) => {
    if (!a.category) return b.category ? 1 : 0;
    if (!b.category) return -1;
    return a.category.order - b.category.order || a.category.id - b.category.id;
  });
}
