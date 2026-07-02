import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import type { Extension, Range } from '@codemirror/state';
import { createHeadingNumberState, nextHeadingNumber } from '@/utils/headingNumber';

/**
 * Yuque-style live heading numbering for the CodeMirror source editor.
 *
 * Display-only: an atomic widget shows ``1.1 `` right after the ``# `` markers,
 * without ever touching the document text. Numbers are recomputed on every doc
 * change so inserting/removing a heading re-numbers the rest live. Coexists
 * with ``livePreview`` (which hides the ``#`` marks) — the number widget sits
 * after the marks, so it reads as ``1.1 Heading`` either way.
 *
 * The numbering algorithm is the shared {@link nextHeadingNumber} so the source
 * editor, the reader and the outline all agree.
 */

const HEADING_RE = /^(#{1,6})([ \t]+)(\S.*)$/;

class NumberWidget extends WidgetType {
  constructor(readonly number: string) {
    super();
  }
  eq(other: NumberWidget) {
    return other.number === this.number;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'jz-cm-heading-num';
    span.textContent = this.number + ' ';
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const marks: Range<Decoration>[] = [];
  const state = createHeadingNumberState();
  // Walk every line in document order so numbering depth stays correct even
  // across lines outside the current viewport.
  const doc = view.state.doc;
  let inFence = false;
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const text = line.text;
    // Skip fenced code blocks — a ``#`` inside them is a comment, not a heading.
    if (/^(```|~~~)/.test(text.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(text);
    if (!m) continue;
    const level = m[1].length;
    const number = nextHeadingNumber(state, level);
    if (!number) continue;
    // Insert the widget just after the ``#### `` markers (marker + whitespace).
    const pos = line.from + m[1].length + m[2].length;
    marks.push(
      Decoration.widget({ widget: new NumberWidget(number), side: -1 }).range(pos),
    );
  }
  return Decoration.set(marks, true);
}

export function headingNumber(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
