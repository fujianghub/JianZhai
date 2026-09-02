/**
 * Generic collapsible-tree helpers shared by the EPUB reader's TOC and the
 * knowledge-base directory trees (2026-09-02, extracted from
 * ``utils/epubReader.ts`` — same semantics, now structural-typed so any entry
 * with ``{key, level, title}`` works).
 *
 * Entries are a *flattened* tree in document order; ``key`` is a dot-path
 * (``'2.1.0'``) that encodes the hierarchy, ``level`` is 1-based depth.
 */

/** Split a title into its numbering prefix and the text so lists can set the
 * number in tabular, muted type: ``第1章 路由器`` → ``['第1章', '路由器']``,
 * ``1.2.3 拓扑`` → ``['1.2.3', '拓扑']``, ``二、总结`` → ``['二、', '总结']``.
 * Titles without a recognisable prefix come back with an empty ``num``. */
export function splitTocTitle(title: string): { num: string; text: string } {
  const t = title.trim();
  const m = t.match(
    /^((?:第\s*[0-9一二三四五六七八九十百零〇两]+\s*[篇章节部卷讲课回])|(?:\d+(?:[.．]\d+)*[.．]?)|(?:[一二三四五六七八九十]+[、.．])|(?:[IVXLC]+[.．])|(?:附录\s*[A-Z一二三四五六七八九十]?)|(?:Chapter\s+\d+)|(?:Part\s+[IVX\d]+))(?:(?<=[、.．:：])|(?=[\s:：、]|$))[\s:：、]*(.*)$/i,
  );
  if (!m || !m[2]) return { num: '', text: t };
  return { num: m[1].trim(), text: m[2].trim() };
}

/** Parent key of a flattened entry (``'2.1.0'`` → ``'2.1'``), ``null`` at the root. */
export function tocParentKey(key: string): string | null {
  const i = key.lastIndexOf('.');
  return i < 0 ? null : key.slice(0, i);
}

/** Every ancestor key of ``key`` (nearest first). */
export function tocAncestorKeys(key: string): string[] {
  const out: string[] = [];
  for (let k = tocParentKey(key); k != null; k = tocParentKey(k)) out.push(k);
  return out;
}

/** Whether entry ``i`` has children (the next entry is nested deeper). */
export function tocHasChildren<T extends { level: number }>(entries: T[], i: number): boolean {
  const next = entries[i + 1];
  return !!next && next.level > entries[i].level;
}

/** Keys expanded by default: every entry shallower than ``depth`` (so the tree
 * shows ``depth`` levels), i.e. depth 2 = level-1 entries expanded. */
export function defaultExpandedTocKeys<T extends { key: string; level: number }>(entries: T[], depth = 2): Set<string> {
  const set = new Set<string>();
  entries.forEach((e, i) => {
    if (e.level < depth && tocHasChildren(entries, i)) set.add(e.key);
  });
  return set;
}

/** Entries whose ancestors are all expanded. */
export function visibleTocEntries<T extends { key: string }>(entries: T[], expanded: Set<string>): T[] {
  return entries.filter((e) => tocAncestorKeys(e.key).every((k) => expanded.has(k)));
}

/** Case-insensitive title filter; empty query → ``entries`` unchanged. */
export function filterTocEntries<T extends { title: string }>(entries: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.title.toLowerCase().includes(q));
}
