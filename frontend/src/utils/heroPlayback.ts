/**
 * Pure helpers for the hero quote rotator & management page.
 *
 * Kept free of React so they unit-test trivially:
 *   - buildPlayOrder    — index permutation for sequential / random play
 *   - quotesToBatchText — reverse of the backend batch-import parser,
 *                         used by the /admin/hero「导出」button
 */
import type { HeroPlayOrder, HeroQuote } from '@/api/hero';

/**
 * Return the order in which quote indices should play.
 *
 * ``sequential`` → identity [0, 1, …, n-1].
 * ``random``     → a fresh Fisher–Yates permutation per call — so every
 * page load starts somewhere new and never repeats a quote within one
 * full cycle. An injectable ``rng`` keeps tests deterministic.
 */
export function buildPlayOrder(
  count: number,
  mode: HeroPlayOrder,
  rng: () => number = Math.random,
): number[] {
  const order = Array.from({ length: Math.max(0, count) }, (_, i) => i);
  if (mode !== 'random' || count <= 1) return order;
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Serialize quotes back into the batch-import line format:
 *
 *   正文 — 〔朝代〕作者 · 篇名
 *
 * Pieces degrade gracefully — a quote with only an author renders as
 * ``正文 — 作者``; a bare quote renders as just its text. The output
 * round-trips through the backend ``_parse_batch_lines`` parser, which
 * makes it a handy backup / migration format.
 */
export function quotesToBatchText(quotes: HeroQuote[]): string {
  const lines = quotes
    .filter((q) => (q.text || '').trim())
    .map((q) => {
      const text = q.text.trim();
      const dynasty = (q.dynasty || '').trim();
      const author = (q.author || '').trim();
      const source = (q.source || '').trim();
      let rest = '';
      if (dynasty) rest += `〔${dynasty}〕`;
      if (author) rest += author;
      // Only join with · when an author precedes — a dangling "〔宋〕 · 篇名"
      // would confuse the re-import parser.
      if (source) rest += author ? ` · ${source}` : source;
      return rest ? `${text} — ${rest}` : text;
    });
  return lines.join('\n');
}
