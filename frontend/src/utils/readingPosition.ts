/**
 * Per-post reading-position memory (reader side).
 *
 * Stores scroll progress as a 0–1 fraction keyed by post slug in a single
 * localStorage map, so a returning reader can jump back to where they left
 * off. Deliberately tiny and dependency-free; all policy knobs live here so
 * the logic is unit-testable without a DOM.
 */

export interface ReadingPositionEntry {
  /** Scroll progress, 0–1. */
  p: number;
  /** Last-saved timestamp (ms epoch) — used to prune the oldest entries. */
  t: number;
}

export type ReadingPositionMap = Record<string, ReadingPositionEntry>;

const STORAGE_KEY = 'jz-reading-pos:v1';

/** Keep the map bounded — beyond this many posts, the oldest entries go. */
export const MAX_ENTRIES = 200;

/** Below this progress there is nothing meaningful to resume. */
export const MIN_RESUME = 0.05;
/** Beyond this progress the post counts as finished — no resume prompt. */
export const MAX_RESUME = 0.95;

/** Saves only inside this band; outside it the entry is cleared (top = not
 * started, bottom = finished). */
export const MIN_SAVE = 0.03;
export const MAX_SAVE = 0.97;

function readMap(): ReadingPositionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ReadingPositionMap;
    }
  } catch {
    /* corrupted / unavailable storage → start fresh */
  }
  return {};
}

function writeMap(map: ReadingPositionMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode — position memory is best-effort */
  }
}

/** Pure: drop the oldest entries until at most ``max`` remain. */
export function pruneOldest(map: ReadingPositionMap, max: number): ReadingPositionMap {
  const keys = Object.keys(map);
  if (keys.length <= max) return map;
  const sorted = keys.sort((a, b) => (map[b]?.t ?? 0) - (map[a]?.t ?? 0)).slice(0, max);
  const next: ReadingPositionMap = {};
  for (const k of sorted) next[k] = map[k];
  return next;
}

/** Pure: whether a stored fraction warrants a "continue reading" offer. */
export function shouldOfferResume(percent: number | null | undefined): boolean {
  return typeof percent === 'number' && percent >= MIN_RESUME && percent <= MAX_RESUME;
}

/** Pure: clamp + classify a raw scroll fraction into save/clear/ignore. */
export function classifyProgress(percent: number): 'save' | 'clear' {
  if (percent < MIN_SAVE || percent > MAX_SAVE) return 'clear';
  return 'save';
}

export function saveReadingPosition(slug: string, percent: number, now = Date.now()): void {
  if (!slug || !Number.isFinite(percent)) return;
  const map = readMap();
  if (classifyProgress(percent) === 'clear') {
    if (map[slug]) {
      delete map[slug];
      writeMap(map);
    }
    return;
  }
  map[slug] = { p: Math.min(1, Math.max(0, percent)), t: now };
  writeMap(pruneOldest(map, MAX_ENTRIES));
}

export function loadReadingPosition(slug: string): number | null {
  if (!slug) return null;
  const entry = readMap()[slug];
  return entry && Number.isFinite(entry.p) ? entry.p : null;
}

export function clearReadingPosition(slug: string): void {
  const map = readMap();
  if (map[slug]) {
    delete map[slug];
    writeMap(map);
  }
}
