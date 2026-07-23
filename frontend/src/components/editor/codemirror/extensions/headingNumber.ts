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

/** 一行可能参与编号语义（标题或 fence 边界）。比 HEADING_RE 宽松（允许行首
 *  空白）—— 宁可多重建一次，不可漏重建。 */
const NUMBERING_LINE_RE = /^[ \t]*(#|```|~~~)/;

/**
 * 变更是否可能影响标题编号。普通正文打字（不含换行 / ``#`` / fence 字符、
 * 不落在标题或 fence 行上）返回 false —— 这类编辑只需把既有装饰经
 * ``changes`` 平移，免去每键全文 O(N) 重扫（开编号后大文档的首要热点）。
 */
export function changeMayAffectNumbering(update: ViewUpdate): boolean {
  let affected = false;
  update.changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
    if (affected) return;
    // 插入含换行（可能拆出新标题行）或 #/`/~（可能敲出标题、fence）
    if (/[\n#`~]/.test(inserted.toString())) {
      affected = true;
      return;
    }
    const startDoc = update.startState.doc;
    const lineFrom = startDoc.lineAt(fromA);
    // 删除跨行（合并了行，可能吞掉标题行 / fence 边界）
    if (toA > lineFrom.to) {
      affected = true;
      return;
    }
    // 被编辑的行在旧/新文档任一侧是标题或 fence 行
    if (NUMBERING_LINE_RE.test(lineFrom.text)) {
      affected = true;
      return;
    }
    if (NUMBERING_LINE_RE.test(update.state.doc.lineAt(fromB).text)) {
      affected = true;
    }
  });
  return affected;
}

export function headingNumber(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }
      update(update: ViewUpdate) {
        if (!update.docChanged) return;
        if (changeMayAffectNumbering(update)) {
          this.decorations = buildDecorations(update.view);
        } else {
          this.decorations = this.decorations.map(update.changes);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
