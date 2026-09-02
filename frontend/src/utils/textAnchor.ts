/**
 * TextQuote-style anchoring for Markdown article highlights.
 *
 * A highlight is stored as ``{quote, prefix?, suffix?, heading?}`` — the
 * selected text plus ~32 chars of context and the nearest heading slug — and
 * re-anchored at render time by searching the article's *filtered* text
 * (subtrees that other enhancers mutate asynchronously are excluded, so the
 * offsets stay meaningful). Drift-tolerant by design: after an edit the quote
 * is searched again (exact first, whitespace-normalised second); when it is
 * gone the highlight is reported unresolved — the caller keeps it in the
 * notes list marked 失效 instead of dropping it.
 *
 * Pure DOM (no React, no network) so it is unit-tested under happy-dom.
 */

export interface TextSelector {
  quote: string;
  prefix?: string;
  suffix?: string;
  /** Slug (id) of the nearest preceding H1–H4, used to scope the search. */
  heading?: string;
}

/** Subtrees whose text is unstable (async enhancers) or non-prose. */
export const ANCHOR_EXCLUDE_SELECTOR = [
  'button',
  'svg',
  '.jz-code-block', // mermaid canvases are replaced wholesale by CodeBlockEnhancer
  '[data-jz-link-card]', // CardEnhancer injects fetched text later
  '[data-jz-doc-card]',
  '.katex', // MathML/aria text duplicates the formula
  '.katex-display',
].join(', ');

export const CONTEXT_CHARS = 32;

interface CollectedNode {
  node: Text;
  start: number;
  /** id of the nearest preceding (or containing) H1–H4 with an id. */
  heading: string | null;
}

export interface CollectedText {
  text: string;
  nodes: CollectedNode[];
}

function isExcluded(el: Element | null): boolean {
  return !!el && !!el.closest(ANCHOR_EXCLUDE_SELECTOR);
}

/** Concatenate the root's anchorable text, remembering each text node's
 * offset and its section heading. */
export function collectText(root: Element): CollectedText {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (isExcluded((n as Text).parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: CollectedNode[] = [];
  let text = '';
  let heading: string | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const h = t.parentElement?.closest('h1[id], h2[id], h3[id], h4[id]');
    if (h && root.contains(h)) heading = h.id;
    nodes.push({ node: t, start: text.length, heading });
    text += t.data;
  }
  return { text, nodes };
}

/** Map a filtered-text offset back to a (text node, offset) DOM position.
 * ``preferEnd``: an offset on a node boundary resolves into the earlier node
 * (for range ends) instead of the later one (for range starts). */
export function locate(collected: CollectedText, pos: number, preferEnd = false): [Text, number] | null {
  const { nodes } = collected;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const { node, start } = nodes[i];
    const end = start + node.data.length;
    if (pos > start && pos < end) return [node, pos - start];
    if (pos === end && preferEnd) return [node, node.data.length];
    if (pos === start && !preferEnd) return [node, 0];
    if (pos === end && i === nodes.length - 1) return [node, node.data.length];
    if (pos === start && i === 0) return [node, 0];
  }
  return null;
}

/** Filtered-text offset of a DOM boundary point (null when the boundary sits
 * inside an excluded subtree). */
function boundaryOffset(collected: CollectedText, container: Node, offset: number): number | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const entry = collected.nodes.find((c) => c.node === container);
    if (!entry) return null;
    return entry.start + Math.min(offset, entry.node.data.length);
  }
  // Element boundary: the first collected node at/after the point.
  const doc = container.ownerDocument;
  if (!doc) return null;
  const probe = doc.createRange();
  probe.setStart(container, Math.min(offset, container.childNodes.length));
  probe.collapse(true);
  for (const c of collected.nodes) {
    const r = doc.createRange();
    r.selectNodeContents(c.node);
    if (probe.compareBoundaryPoints(Range.END_TO_START, r) <= 0) return c.start;
  }
  return collected.text.length;
}

export interface DescribedRange {
  selector: TextSelector;
  /** Filtered-text offsets, for same-render ordering. */
  start: number;
  end: number;
  /** Display text of the section heading (not the slug), for the 章节 field. */
  headingText: string;
}

/** Build the stored selector for a live selection range. Returns null when
 * the selection carries no anchorable text (fully inside excluded subtrees). */
export function describeRange(root: Element, range: Range): DescribedRange | null {
  const collected = collectText(root);
  const start = boundaryOffset(collected, range.startContainer, range.startOffset);
  const end = boundaryOffset(collected, range.endContainer, range.endOffset);
  if (start == null || end == null || end <= start) return null;
  const quote = collected.text.slice(start, end);
  if (!quote.trim()) return null;
  const entry = collected.nodes.filter((c) => c.start <= start).pop() ?? null;
  const heading = entry?.heading ?? null;
  const headingEl = heading ? root.querySelector(`#${CSS.escape(heading)}`) : null;
  const selector: TextSelector = {
    quote: quote.slice(0, 2000),
    prefix: collected.text.slice(Math.max(0, start - CONTEXT_CHARS), start),
    suffix: collected.text.slice(end, end + CONTEXT_CHARS),
    ...(heading ? { heading } : null),
  };
  return { selector, start, end, headingText: (headingEl?.textContent ?? '').trim() };
}

function contextScore(text: string, at: number, quoteLen: number, sel: TextSelector): number {
  let score = 0;
  const prefix = sel.prefix ?? '';
  const suffix = sel.suffix ?? '';
  for (let i = 1; i <= prefix.length; i++) {
    if (text[at - i] === prefix[prefix.length - i]) score++;
    else break;
  }
  for (let i = 0; i < suffix.length; i++) {
    if (text[at + quoteLen + i] === suffix[i]) score++;
    else break;
  }
  return score;
}

/** All start indices of ``needle`` in ``hay``. */
function occurrences(hay: string, needle: string): number[] {
  const out: number[] = [];
  let i = hay.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = hay.indexOf(needle, i + 1);
  }
  return out;
}

/** Collapse whitespace runs, keeping a map back to original indices. */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  const map: number[] = [];
  let norm = '';
  let lastWasSpace = true; // leading whitespace dropped
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        norm += ' ';
        map.push(i);
        lastWasSpace = true;
      }
    } else {
      norm += ch;
      map.push(i);
      lastWasSpace = false;
    }
  }
  if (norm.endsWith(' ')) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

export interface ResolvedAnchor {
  range: Range;
  start: number;
  end: number;
}

/** Re-anchor a stored selector inside ``root``. Exact match first (scored by
 * surrounding context and by the heading section), then a
 * whitespace-normalised pass; null = 失效 (keep the row, mark it). */
export function resolveSelector(root: Element, sel: TextSelector, collectedIn?: CollectedText): ResolvedAnchor | null {
  const collected = collectedIn ?? collectText(root);
  const { text } = collected;
  if (!sel.quote) return null;

  const sectionBounds = ((): [number, number] | null => {
    if (!sel.heading) return null;
    const idx = collected.nodes.findIndex((c) => c.heading === sel.heading);
    if (idx === -1) return null;
    let endIdx = collected.nodes.length;
    for (let i = idx + 1; i < collected.nodes.length; i++) {
      if (collected.nodes[i].heading !== sel.heading) {
        endIdx = i;
        break;
      }
    }
    const endPos = endIdx < collected.nodes.length ? collected.nodes[endIdx].start : text.length;
    return [collected.nodes[idx].start, endPos];
  })();

  const pick = (cands: number[], quoteLen: number, hay: string): number | null => {
    if (cands.length === 0) return null;
    let best = cands[0];
    let bestScore = -1;
    for (const at of cands) {
      let score = contextScore(hay, at, quoteLen, sel);
      if (sectionBounds && hay === text && at >= sectionBounds[0] && at < sectionBounds[1]) score += 1000;
      if (score > bestScore) {
        bestScore = score;
        best = at;
      }
    }
    return best;
  };

  const exact = pick(occurrences(text, sel.quote), sel.quote.length, text);
  let start: number | null = null;
  let end: number | null = null;
  if (exact != null) {
    start = exact;
    end = exact + sel.quote.length;
  } else {
    // Whitespace drift (a reflowed paragraph, an edited line break).
    const { norm, map } = normalizeWithMap(text);
    const normQuote = normalizeWithMap(sel.quote).norm;
    if (normQuote) {
      const at = pick(occurrences(norm, normQuote), normQuote.length, norm);
      if (at != null) {
        start = map[at];
        end = map[at + normQuote.length - 1] + 1;
      }
    }
  }
  if (start == null || end == null) return null;
  const a = locate(collected, start, false);
  const b = locate(collected, end, true);
  if (!a || !b) return null;
  const range = root.ownerDocument.createRange();
  range.setStart(a[0], a[1]);
  range.setEnd(b[0], b[1]);
  return { range, start, end };
}
