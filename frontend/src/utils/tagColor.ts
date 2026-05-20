/**
 * Stable color derivation for tags whose `color` field is empty.
 *
 * Why hash-based: standard Ant Design `<Tag>` colors are limited, and if every
 * untyped tag gets the same one ("blue"), the homepage looks monochrome. We
 * pick from a 12-color cinnabar-leaning palette using a deterministic hash so
 * the same tag name always ends up the same color.
 */

/** Cinnabar-friendly palette. Each entry maps to an Ant Design tag color
 *  preset that renders well on the rice-paper background. Order matters: we
 *  put warmer / 朱砂-adjacent hues earlier so the first few tags feel "home". */
const PALETTE: readonly string[] = [
  'red',        // 朱砂 — main accent family
  'volcano',    // 朱赤偏暖
  'orange',     // 橘 — 暖调
  'gold',       // 金 — 古铜
  'lime',       // 嫩绿
  'green',      // 苍翠
  'cyan',       // 青
  'blue',       // 黛蓝
  'geekblue',   // 深蓝
  'purple',     // 紫
  'magenta',    // 桃红
  'default',    // 灰 — 收尾
];

/** djb2 hash — small, fast, well-distributed over short strings. */
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  // Always return non-negative
  return Math.abs(hash);
}

/**
 * Resolve a Tag's display color.
 *
 * - If the tag has an explicit `color` (CSS hex or AntD preset name), use it.
 * - Otherwise derive a stable preset from the tag's name / slug.
 */
export function resolveTagColor(input: {
  color?: string | null;
  name?: string | null;
  slug?: string | null;
  id?: number | null;
}): string {
  const explicit = (input.color || '').trim();
  if (explicit) return explicit;
  const key = (input.slug || input.name || String(input.id ?? '')).trim();
  if (!key) return 'default';
  return PALETTE[djb2(key) % PALETTE.length];
}
