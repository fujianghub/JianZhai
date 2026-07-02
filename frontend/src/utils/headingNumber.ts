/**
 * Yuque-style hierarchical heading numbering (display-only).
 *
 * Given the heading levels in document order, produce a numbering string for
 * each heading (``"1"`` / ``"1.1"`` / ``"1.1.1"`` …). Numbering depth follows
 * the *nesting depth* of the heading, not its raw markdown level: skipped
 * intermediate levels do NOT create empty segments. So a document with
 * ``h1, h2, h4, h1`` yields ``1, 1.1, 1.1.1, 2`` — the jump from h2 to h4 just
 * opens one deeper segment rather than ``1.1.0.1``.
 *
 * The single source of truth for numbering across every surface: the reader
 * (markdown-it ``heading_open``), the CodeMirror source editor, the Tiptap
 * rich-text editor and the outline / TOC panels all call this so the numbers
 * agree everywhere.
 */

export interface HeadingNumberOptions {
  /** Lowest markdown level that participates in numbering (default 1). */
  min?: number;
  /** Highest markdown level that participates in numbering (default 6). */
  max?: number;
}

interface StackFrame {
  /** Raw markdown level (1–6) of the heading that opened this depth. */
  level: number;
  /** Sibling counter at this depth. */
  count: number;
}

/**
 * Mutable numbering cursor. Use it when headings arrive one at a time (e.g.
 * the markdown-it ``heading_open`` rule renders each heading as it is reached)
 * so the running number stays consistent with the batch API below.
 */
export interface HeadingNumberState {
  stack: StackFrame[];
}

export function createHeadingNumberState(): HeadingNumberState {
  return { stack: [] };
}

/**
 * Advance the cursor by one heading and return its numbering label. A heading
 * outside ``[min, max]`` returns ``''`` and does NOT open a depth segment.
 */
export function nextHeadingNumber(
  state: HeadingNumberState,
  level: number,
  opts: HeadingNumberOptions = {},
): string {
  const min = opts.min ?? 1;
  const max = opts.max ?? 6;
  if (level < min || level > max) return '';
  const { stack } = state;
  // Close every segment strictly deeper than this heading.
  while (stack.length > 0 && stack[stack.length - 1].level > level) {
    stack.pop();
  }
  if (stack.length > 0 && stack[stack.length - 1].level === level) {
    // A sibling at the same depth → advance its counter.
    stack[stack.length - 1].count += 1;
  } else {
    // Deeper than the current tail (or first heading) → open a new segment.
    stack.push({ level, count: 1 });
  }
  return stack.map((f) => f.count).join('.');
}

/**
 * Compute the numbering label for every heading.
 *
 * @param levels heading markdown levels (1–6) in document order
 * @returns a parallel array of numbering strings; headings outside
 *          ``[min, max]`` get an empty string (not numbered, no depth opened)
 */
export function computeHeadingNumbers(
  levels: number[],
  opts: HeadingNumberOptions = {},
): string[] {
  const state = createHeadingNumberState();
  return levels.map((level) => nextHeadingNumber(state, level, opts));
}
