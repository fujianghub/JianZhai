/**
 * Hero quote rotator for the blog homepage.
 *
 * Reads the singleton ``/api/v1/public/hero/`` (slim shape: enabled,
 * rotation_seconds, animation, play_order, quotes[] with split author /
 * source). Renders one quote at a time and advances on a timer with a
 * real two-stage transition: ``enter`` (0.7s) → hold (rotation_seconds)
 * → ``leave`` (0.5s) → swap index → ``enter`` (0.7s) → …
 *
 * Play order: ``random`` (default) shuffles a fresh permutation on every
 * page load via ``buildPlayOrder`` — no repeats within one full cycle;
 * ``sequential`` walks the list as authored.
 *
 * Interaction:
 *   - hover  → pauses the hold countdown so long quotes can be finished
 *   - click  → advances to the next quote immediately
 *
 * Fallbacks:
 *   - API unreachable     → renders the original 诸葛亮 quote so the
 *                            page never goes blank.
 *   - enabled = false     → renders nothing (caller hides hero region).
 *   - one quote only      → static display, no timer, no transitions.
 *
 * Visual layers (top → bottom):
 *   1. Quote body (large + 印章 seal)
 *   2. Author    (medium + gold rules)
 *   3. Source    (small italic, prefixed with 〈〉 angle quotes)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getPublicHero, type HeroAnimation, type HeroPublic, type HeroQuote } from '@/api/hero';
import { buildPlayOrder } from '@/utils/heroPlayback';

const FALLBACK: HeroPublic = {
  enabled: true,
  rotation_seconds: 8,
  animation: 'fade',
  play_order: 'sequential',
  quotes: [
    {
      id: 'fallback-1',
      text: '年与时驰 · 意与日去 · 遂成枯落',
      dynasty: '三国',
      author: '诸葛亮',
      source: '诫子书',
    },
  ],
};

/** How long the ``leave`` phase takes before we swap to the next quote.
 *  Must match the longest exit keyframe in styles/theme.css. */
const LEAVE_MS = 500;

interface Props {
  /** Optional override — when the management page wants live preview
   *  without committing to the API. Bypasses the fetch entirely. */
  preview?: HeroPublic;
}

export default function HeroQuoteRotator({ preview }: Props) {
  const [data, setData] = useState<HeroPublic | null>(preview ?? null);
  /** Index permutation built once per data load — identity for
   *  ``sequential``, a fresh Fisher–Yates shuffle for ``random``. */
  const [order, setOrder] = useState<number[]>([]);
  /** Position within ``order`` (NOT a raw quote index). */
  const [pos, setPos] = useState(0);
  /** Per-cycle re-mount key. Keyframe animations only re-run on mount; we
   *  bump this each time we want the entrance to replay. */
  const [tick, setTick] = useState(0);
  /** Drives the ``.is-leaving`` class — the wrapper plays the exit half
   *  of its animation, then we swap the quote and bump ``tick`` for entry. */
  const [leaving, setLeaving] = useState(false);
  /** Hover pause — while true the hold timer never arms, so the current
   *  quote stays up until the pointer leaves. */
  const [paused, setPaused] = useState(false);
  const enterTimerRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);

  /** Cancel a mid-flight leave swap — used when the data set changes
   *  underneath the rotation so a stale timer can't advance the new list. */
  const cancelLeave = useCallback(() => {
    if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = null;
  }, []);

  // Fetch once if not in preview mode. Public endpoint = no auth.
  useEffect(() => {
    if (preview) {
      cancelLeave();
      setData(preview);
      setOrder(buildPlayOrder(preview.quotes.length, preview.play_order));
      setPos(0);
      setTick((n) => n + 1);
      setLeaving(false);
      return;
    }
    let cancelled = false;
    getPublicHero()
      .then((d) => {
        if (cancelled) return;
        cancelLeave();
        setData(d);
        setOrder(buildPlayOrder(d.quotes.length, d.play_order));
        setPos(0);
        setLeaving(false);
      })
      .catch(() => {
        if (cancelled) return;
        cancelLeave();
        setData(FALLBACK);
        setOrder(buildPlayOrder(FALLBACK.quotes.length, FALLBACK.play_order));
        setPos(0);
        setLeaving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preview, cancelLeave]);

  /** Play the exit half, then advance one step through ``order``. */
  const advance = useCallback(() => {
    if (!data || data.quotes.length <= 1) return;
    setLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => {
      setPos((p) => (p + 1) % Math.max(1, data.quotes.length));
      setTick((n) => n + 1);
      setLeaving(false);
    }, LEAVE_MS);
  }, [data]);

  // Two-stage rotation:
  //   1. After ``rotation_seconds`` of hold, switch to ``leaving=true``
  //      so CSS plays the exit half of the animation.
  //   2. After ``LEAVE_MS``, bump the position, clear ``leaving``, and
  //      bump ``tick`` so the new quote re-mounts and plays the entry half.
  //
  // This effect arms (and on cleanup clears) ONLY the hold timer. The
  // leave timer must survive effect re-runs — hovering mid-exit would
  // otherwise cancel the pending swap and strand the quote in its
  // ``is-leaving`` (invisible) state. While ``paused`` (hover) or
  // ``leaving`` no hold timer is armed; un-hovering restarts a full
  // hold period.
  useEffect(() => {
    if (!data || data.quotes.length <= 1 || paused || leaving) return;
    const delayMs = Math.max(1, data.rotation_seconds) * 1000;
    enterTimerRef.current = window.setTimeout(() => advance(), delayMs);
    return () => {
      if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    };
  }, [data, pos, paused, leaving, advance]);

  // Unmount-only: drop whatever leave swap is still queued.
  useEffect(() => cancelLeave, [cancelLeave]);

  // Click anywhere on the quote → skip the remaining hold and advance now.
  // Guarded against double-fire while the exit animation is mid-flight.
  const onClickNext = useCallback(() => {
    if (!data || data.quotes.length <= 1 || leaving) return;
    if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
    enterTimerRef.current = null;
    advance();
  }, [data, leaving, advance]);

  if (!data || !data.enabled || data.quotes.length === 0) return null;
  const current = data.quotes[order[pos] ?? 0] ?? data.quotes[0];
  const interactive = data.quotes.length > 1;
  return (
    <div
      className={`jz-hero-rotator-shell${interactive ? ' is-interactive' : ''}`}
      title={interactive ? '点击换一条 · 悬停暂停轮播' : undefined}
      onMouseEnter={interactive ? () => setPaused(true) : undefined}
      onMouseLeave={interactive ? () => setPaused(false) : undefined}
      onClick={interactive ? onClickNext : undefined}
    >
      <HeroQuoteCard
        quote={current}
        animation={data.animation}
        animationKey={tick}
        leaving={leaving}
      />
    </div>
  );
}

/** Pure presentation of one quote with animation class applied. Exposed so
 *  the management page can render previews of arbitrary quote / animation
 *  pairs without going through state. */
export function HeroQuoteCard({
  quote,
  animation,
  animationKey,
  leaving = false,
}: {
  quote: HeroQuote;
  animation: HeroAnimation;
  animationKey: number;
  /** Optional — when true, plays the exit half of the animation. */
  leaving?: boolean;
}) {
  const animClass = `jz-hero-anim-${animation}`;
  // Split text on " · " so each fragment renders as its own segment with
  // a thin separator between — preserves the classic "年与时驰·意与日去·
  // 遂成枯落" stacked layout. Plain quotes render in one segment.
  const segments = quote.text.includes(' · ')
    ? quote.text.split(' · ').map((s) => s.trim()).filter(Boolean)
    : [quote.text];

  // Back-compat: older payloads (pre-v0.9.4) only sent ``attribution``.
  // If all split fields are absent but attribution is present, render
  // attribution as a single combined line (gold-rule treatment).
  const hasSplit = !!(quote.dynasty || quote.author || quote.source);
  const legacyAttribution = !hasSplit ? (quote.attribution || '').trim() : '';

  return (
    <div
      className={`jz-hero-rotator ${animClass} ${leaving ? 'is-leaving' : ''}`}
      key={animationKey}
    >
      {/* ── Layer 1: 正文 (大字 + 印章 + 「」 quote marks) ───────────── */}
      <div className="jz-hero-quote-wrap">
        <span className="jz-hero-quote-mark jz-hero-quote-mark-left" aria-hidden>「</span>
        <div className="jz-hero-quote">
          {segments.map((seg, i) => (
            <span key={`${animationKey}-${i}`} className="jz-hero-quote-seg">
              {animation === 'typewriter' ? <TypewriterText text={seg} delay={i * 0.4} /> : seg}
              {i < segments.length - 1 && (
                <span className="jz-hero-quote-sep" aria-hidden>·</span>
              )}
            </span>
          ))}
          <span className="jz-hero-seal" aria-label="印章">
            <span className="jz-hero-seal-text">简斋</span>
          </span>
        </div>
        <span className="jz-hero-quote-mark jz-hero-quote-mark-right" aria-hidden>」</span>
      </div>

      {/* ── Layer 2 (single line): 〔朝代〕 作者 〈篇名〉 ───────────────
          Each piece is a separate span so CSS can colour them
          independently — bronze for dynasty, cinnabar for author, ink
          italic for source. Gold rules flank the whole row. */}
      {hasSplit && (
        <div className="jz-hero-cite" role="presentation">
          <span className="jz-hero-attr-rule" aria-hidden />
          <span className="jz-hero-cite-inner">
            {quote.dynasty && (
              <span className="jz-hero-cite-dynasty" title="朝代">
                <span aria-hidden>〔</span>
                <span>{quote.dynasty}</span>
                <span aria-hidden>〕</span>
              </span>
            )}
            {quote.author && (
              <span className="jz-hero-cite-author" title="作者">
                {quote.author}
              </span>
            )}
            {quote.source && (
              <span className="jz-hero-cite-source" title="篇名">
                <span aria-hidden>〈</span>
                <span>{quote.source}</span>
                <span aria-hidden>〉</span>
              </span>
            )}
          </span>
          <span className="jz-hero-attr-rule" aria-hidden />
        </div>
      )}

      {/* Legacy single-line attribution — only when split fields missing. */}
      {!hasSplit && legacyAttribution && (
        <div className="jz-hero-cite">
          <span className="jz-hero-attr-rule" aria-hidden />
          <span className="jz-hero-cite-author">{legacyAttribution}</span>
          <span className="jz-hero-attr-rule" aria-hidden />
        </div>
      )}
    </div>
  );
}

/** Char-by-char reveal driven by CSS animation-delay. Cheaper than a
 *  setTimeout loop and survives React re-renders gracefully (the keyframe
 *  runs once and stays at its end state). The trailing ▌ block-cursor
 *  blinks for the rotation hold duration so the line reads as "live". */
function TypewriterText({ text, delay = 0 }: { text: string; delay?: number }) {
  const total = delay + text.length * 0.08;
  return (
    <span className="jz-hero-typewriter-line">
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          className="jz-hero-typewriter-char"
          style={{ animationDelay: `${delay + i * 0.08}s` }}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
      <span
        className="jz-hero-typewriter-caret"
        aria-hidden
        style={{ animationDelay: `${total}s` }}
      >
        ▌
      </span>
    </span>
  );
}
