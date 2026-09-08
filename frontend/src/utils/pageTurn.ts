/**
 * Page-turn animation via View Transitions, shared by the PPT reader (the
 * EPUB reader keeps its own five-style variant in EpubReader.tsx).
 *
 * The stage gets a `view-transition-name` for the duration of the turn and
 * <html> carries `data-jz-turn` / `data-jz-turn-dir`, which reader.css maps to
 * the slide / fade keyframes. `html[data-jz-turn]{view-transition-name:none}`
 * opts the root out of the snapshot so theme.css's root dissolve doesn't
 * replay on every turn (same contract as the EPUB reader).
 */
import { prefersReducedMotion } from './motionPref';

export type TurnDir = 'next' | 'prev' | 'jump';

type VTDocument = Document & { startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> } };

export function supportsViewTransitions(): boolean {
  return typeof document !== 'undefined' && typeof (document as VTDocument).startViewTransition === 'function';
}

const turning = new WeakSet<Element>();

/** Resolve once `src` is loaded *and decoded* (or after `timeoutMs`) so the
 * swapped-in <img> paints on its first frame — without this the slide goes
 * blank for a frame or two on every turn (and the incoming View Transition
 * snapshot is taken from that blank). */
export function preloadImage(src: string, timeoutMs = 600): Promise<void> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve();
    const img = new Image();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(done, timeoutMs);
    const decode = () => (typeof img.decode === 'function' ? img.decode().then(done, done) : done());
    img.onload = decode;
    img.onerror = done;
    img.src = src;
    if (img.complete && img.naturalWidth > 0) void decode();
  });
}

export interface PageTurnOptions {
  stage: HTMLElement | null;
  /** view-transition-name used by the CSS rules (e.g. `jz-pptx-slide`). */
  name: string;
  dir: TurnDir;
  /** Applies the DOM change synchronously (wrap React updates in flushSync). */
  run: () => void;
  /** Image to decode before the turn starts. */
  preload?: string | null;
}

/** Run `run` inside a View Transition when the environment allows, plainly
 * otherwise (no VT support, reduced motion, a turn already in flight). */
export function runPageTurn(opts: PageTurnOptions): void {
  const { stage, name, dir, run } = opts;
  const animate = !!stage && supportsViewTransitions() && !prefersReducedMotion() && !turning.has(stage);
  if (!animate) {
    // No animation, but still decode the target first so the swap never
    // shows an empty box.
    if (opts.preload) void preloadImage(opts.preload).then(run);
    else run();
    return;
  }
  const start = () => {
    const root = document.documentElement;
    turning.add(stage);
    stage.style.viewTransitionName = name;
    root.dataset.jzTurn = dir === 'jump' ? 'fade' : 'slide';
    root.dataset.jzTurnDir = dir;
    const done = () => {
      stage.style.viewTransitionName = '';
      delete root.dataset.jzTurn;
      delete root.dataset.jzTurnDir;
      turning.delete(stage);
    };
    try {
      const vt = (document as VTDocument).startViewTransition!(() => {
        run();
      });
      vt.finished.then(done, done);
    } catch {
      done();
      run();
    }
  };
  if (opts.preload) void preloadImage(opts.preload).then(start);
  else start();
}
