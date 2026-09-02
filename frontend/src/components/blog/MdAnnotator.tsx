/**
 * Highlights + notes for the Markdown reading page.
 *
 * The EPUB reader anchors with CFIs and paints through foliate's SVG
 * overlayer; here the article is plain in-document HTML, so anchoring is
 * TextQuote-style (``utils/textAnchor.ts``) and painting goes through the
 * CSS Custom Highlight API — both zero-DOM-mutation, which keeps the
 * enhancers (tables, cards, long images) and CFI-style stability intact.
 * ``::highlight()`` has no click targets, so clicks are resolved via
 * ``caretPositionFromPoint`` + ``Range.isPointInRange``.
 *
 * Anchors are drift-tolerant: after an edit the quote is re-searched; a
 * highlight whose quote is gone stays in the notes list marked 已失效 (user
 * decision 2026-09-02: keep, never auto-delete).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown } from 'antd';
import { message } from '@/utils/notify';
import { createComment } from '@/api/comments';
import {
  createHighlight,
  deleteHighlight,
  listHighlights,
  updateHighlight,
  type Highlight as HighlightRow,
  type HighlightColor,
  type HighlightStyle,
} from '@/api/reading';
import {
  buildCommentFromHighlight,
  buildNotesMarkdown,
  buildQuoteMarkdown,
  loadLastHighlightColor,
  normalizeSelectionText,
  notesFilename,
  saveLastHighlightColor,
} from '@/utils/epubNotes';
import { collectText, describeRange, resolveSelector, type ResolvedAnchor } from '@/utils/textAnchor';
import { prefersReducedMotion } from '@/utils/motionPref';
import EpubSelectionBar, { type SelectionAnchor } from '@/components/common/EpubSelectionBar';
import EpubHighlightCard from '@/components/common/EpubHighlightCard';
import EpubNotesExportModal from '@/components/common/EpubNotesExportModal';
import AIMenuList from '@/components/editor/ai/AIMenuList';
import { JzAiAskIcon, JzAiSparkIcon } from '@/components/common/JzIcon';
import type { AIOpDef } from '@/components/editor/ai/aiOps';

/** What the side panel (notes tab) needs from the annotator. */
export interface MdAnnotationsApi {
  /** Reading order (re-anchored position; unresolved rows last). */
  highlights: HighlightRow[];
  loaded: boolean;
  invalidIds: ReadonlySet<number>;
  openHighlight: (h: HighlightRow) => void;
  openExport: () => void;
}

interface Props {
  documentId: number;
  docTitle: string;
  /** Positioning parent for the floating bar / card (the ``<article>``). */
  articleRef: React.RefObject<HTMLElement | null>;
  /** The prose root inside the article. */
  articleSelector?: string;
  /** Re-anchor when the rendered HTML changes. */
  renderKey: string;
  /** False in edit mode: listeners stand down and paint is cleared. */
  enabled: boolean;
  canCreateDoc: boolean;
  /** ``?hl=`` deep link: scroll to + flash this highlight once resolved. */
  initialHlId?: number | null;
  /** AI ops for the bar's dropdown (staff only); null hides the AI button. */
  aiOps?: AIOpDef[] | null;
  onAI?: (text: string, op: AIOpDef | 'ask') => void;
  onChange?: (api: MdAnnotationsApi) => void;
}

const FLASH_MS = 1800;
const REGISTRY_PREFIX = 'jz-md-';
const STYLE_PREFIX: Record<HighlightStyle, string> = { highlight: 'hl', underline: 'un', squiggly: 'sq' };

type HighlightCtor = new (...ranges: AbstractRange[]) => unknown;
const highlightCtor = (): HighlightCtor | null =>
  typeof window === 'undefined' ? null : ((window as unknown as { Highlight?: HighlightCtor }).Highlight ?? null);
const highlightRegistry = (): Map<string, unknown> | null =>
  (CSS as unknown as { highlights?: Map<string, unknown> }).highlights ?? null;

function clearPaint(): void {
  const reg = highlightRegistry();
  if (!reg) return;
  for (const key of Array.from(reg.keys())) if (key.startsWith(REGISTRY_PREFIX)) reg.delete(key);
}

function anchorFromRangeMd(range: Range, container: HTMLElement): SelectionAnchor | null {
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
  const bound = range.getBoundingClientRect();
  if (!bound.width && !bound.height) return null;
  const first = rects[0] ?? bound;
  const last = rects[rects.length - 1] ?? bound;
  const cr = container.getBoundingClientRect();
  return {
    x: bound.left - cr.left,
    y: first.top - cr.top,
    w: bound.width,
    h: Math.max(first.height, last.bottom - first.top),
  };
}

function caretPoint(doc: Document, x: number, y: number): [Node, number] | null {
  type WithCaret = Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const d = doc as WithCaret;
  const pos = d.caretPositionFromPoint?.(x, y);
  if (pos) return [pos.offsetNode, pos.offset];
  const r = d.caretRangeFromPoint?.(x, y);
  return r ? [r.startContainer, r.startOffset] : null;
}

export default function MdAnnotator({
  documentId,
  docTitle,
  articleRef,
  articleSelector = '.jz-post-article',
  renderKey,
  enabled,
  canCreateDoc,
  initialHlId = null,
  aiOps = null,
  onAI,
  onChange,
}: Props) {
  const [highlights, setHighlights] = useState<HighlightRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selection, setSelection] = useState<{ text: string; anchor: SelectionAnchor } | null>(null);
  const [card, setCard] = useState<{ id: number; anchor: SelectionAnchor; focusNote?: boolean } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [lastColor, setLastColor] = useState<HighlightColor>(() => loadLastHighlightColor());
  /** Bumped whenever ``resolvedRef`` was rebuilt (paint + ordering redo). */
  const [resolveTick, setResolveTick] = useState(0);

  const highlightsRef = useRef<HighlightRow[]>([]);
  const resolvedRef = useRef<Map<number, ResolvedAnchor | null>>(new Map());
  const selectionRangeRef = useRef<Range | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const deepLinkDoneRef = useRef(false);

  const canPaint = useMemo(() => !!highlightCtor() && !!highlightRegistry(), []);

  const prose = useCallback(
    (): HTMLElement | null => articleRef.current?.querySelector<HTMLElement>(articleSelector) ?? null,
    [articleRef, articleSelector],
  );

  const commit = (next: HighlightRow[]) => {
    highlightsRef.current = next;
    setHighlights(next);
  };

  /* ── Load ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    commit([]);
    resolvedRef.current = new Map();
    setLoaded(false);
    setCard(null);
    setSelection(null);
    deepLinkDoneRef.current = false;
    if (!documentId) return;
    let cancelled = false;
    listHighlights(documentId)
      .then((list) => {
        if (cancelled) return;
        commit(list.filter((h) => h.selector));
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  /* ── Re-anchor (one text walk per render key / list change) ─────────── */
  useEffect(() => {
    if (!enabled) {
      clearPaint();
      return;
    }
    const root = prose();
    if (!root) return;
    const collected = collectText(root);
    const map = new Map<number, ResolvedAnchor | null>();
    for (const h of highlightsRef.current) {
      if (!h.selector) continue;
      try {
        map.set(h.id, resolveSelector(root, h.selector, collected));
      } catch {
        map.set(h.id, null);
      }
    }
    resolvedRef.current = map;
    setResolveTick((t) => t + 1);
  }, [enabled, renderKey, highlights, prose]);

  /* ── Paint ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    clearPaint();
    if (!enabled || !canPaint) return;
    const Ctor = highlightCtor();
    const reg = highlightRegistry();
    if (!Ctor || !reg) return;
    const groups = new Map<string, Range[]>();
    for (const h of highlightsRef.current) {
      const r = resolvedRef.current.get(h.id);
      if (!r) continue;
      const key = `${REGISTRY_PREFIX}${STYLE_PREFIX[h.style]}-${h.color}`;
      const list = groups.get(key) ?? [];
      list.push(r.range);
      groups.set(key, list);
    }
    for (const [key, ranges] of groups) reg.set(key, new Ctor(...ranges));
    return clearPaint;
  }, [resolveTick, enabled, canPaint]);

  /* ── Selection → floating bar ───────────────────────────────────────── */
  useEffect(() => {
    if (!enabled) return;
    const root = prose();
    const container = articleRef.current;
    if (!root || !container) return;
    let timer = 0;
    let pointerDown = false;
    const read = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (pointerDown) return;
        const sel = document.getSelection();
        const raw = sel?.toString() ?? '';
        if (!sel || sel.isCollapsed || !raw.trim() || raw.trim().length < 2) {
          setSelection(null);
          selectionRangeRef.current = null;
          return;
        }
        const range = sel.getRangeAt(0);
        if (!root.contains(range.commonAncestorContainer)) {
          setSelection(null);
          return;
        }
        const anchor = anchorFromRangeMd(range, container);
        if (!anchor) return;
        selectionRangeRef.current = range.cloneRange();
        setCard(null);
        setSelection({ text: normalizeSelectionText(raw), anchor });
      }, 160);
    };
    const down = () => {
      pointerDown = true;
    };
    const up = () => {
      pointerDown = false;
      read();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelection(null);
        setCard(null);
      }
    };
    document.addEventListener('selectionchange', read);
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointerup', up);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('selectionchange', read);
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled, prose, articleRef, renderKey]);

  /* ── Click on a painted highlight → card ────────────────────────────── */
  useEffect(() => {
    if (!enabled) return;
    const root = prose();
    const container = articleRef.current;
    if (!root || !container) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest('a, button, input, textarea, .jz-epub-selbar, .jz-epub-hlcard')) return;
      if (document.getSelection()?.toString()) return;
      const pt = caretPoint(document, e.clientX, e.clientY);
      let hit: HighlightRow | null = null;
      if (pt) {
        for (const h of highlightsRef.current) {
          const r = resolvedRef.current.get(h.id);
          try {
            if (r?.range.isPointInRange(pt[0], pt[1])) {
              hit = h;
              break;
            }
          } catch {
            /* foreign node */
          }
        }
      }
      if (!hit) {
        setCard(null);
        return;
      }
      const r = resolvedRef.current.get(hit.id);
      const anchor = r ? anchorFromRangeMd(r.range, container) : null;
      if (anchor) {
        setSelection(null);
        setCard({ id: hit.id, anchor });
      }
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
    // resolveTick: ranges are rebuilt → re-bind is cheap and keeps the closure fresh
  }, [enabled, prose, articleRef, resolveTick]);

  /* ── Actions ────────────────────────────────────────────────────────── */
  const copyText = async (text: string, ok = '已复制') => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(ok);
    } catch {
      message.error('复制失败');
    }
  };

  const finishSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    selectionRangeRef.current = null;
  };

  const quoteOf = (text: string, h?: HighlightRow) =>
    buildQuoteMarkdown(text, {
      title: docTitle,
      chapter: h?.chapter,
      docId: documentId,
      hlId: h?.id,
    });

  const addHighlight = async (color: HighlightColor, style: HighlightStyle, withNote = false) => {
    const range = selectionRangeRef.current;
    const root = prose();
    const anchor = selection?.anchor;
    if (!range || !root || !anchor) return;
    const described = describeRange(root, range);
    if (!described) {
      message.info('这段内容暂不支持划线（代码块 / 公式 / 卡片）');
      return;
    }
    try {
      const h = await createHighlight(documentId, {
        selector: described.selector,
        text: normalizeSelectionText(described.selector.quote),
        chapter: described.headingText.slice(0, 200),
        color,
        style,
      });
      commit([...highlightsRef.current, h]);
      saveLastHighlightColor(color);
      setLastColor(color);
      finishSelection();
      if (withNote) setCard({ id: h.id, anchor, focusNote: true });
    } catch {
      message.error('划线保存失败');
    }
  };

  const patchHighlight = async (id: number, patch: { color?: HighlightColor; style?: HighlightStyle; note?: string }) => {
    const cur = highlightsRef.current.find((h) => h.id === id);
    if (!cur) return;
    commit(highlightsRef.current.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    try {
      const saved = await updateHighlight(id, patch);
      commit(highlightsRef.current.map((h) => (h.id === id ? saved : h)));
    } catch {
      commit(highlightsRef.current.map((h) => (h.id === id ? cur : h)));
      message.error('保存失败');
    }
  };

  const removeHighlight = async (id: number) => {
    const cur = highlightsRef.current.find((h) => h.id === id);
    if (!cur) return;
    setCard(null);
    commit(highlightsRef.current.filter((h) => h.id !== id));
    try {
      await deleteHighlight(id);
    } catch {
      commit([...highlightsRef.current, cur]);
      message.error('删除失败');
    }
  };

  const flashRange = useCallback(
    (range: Range) => {
      if (!canPaint) return;
      const Ctor = highlightCtor();
      const reg = highlightRegistry();
      if (!Ctor || !reg) return;
      reg.set(`${REGISTRY_PREFIX}flash`, new Ctor(range));
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => reg.delete(`${REGISTRY_PREFIX}flash`), FLASH_MS);
    },
    [canPaint],
  );

  const openHighlight = useCallback(
    (h: HighlightRow) => {
      const r = resolvedRef.current.get(h.id);
      const container = articleRef.current;
      if (!r || !container) {
        message.info('这条划线在当前正文里已找不到（内容可能已修改）；引文与笔记仍保留');
        return;
      }
      const rect = r.range.getBoundingClientRect();
      window.scrollBy({ top: rect.top - 140, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      flashRange(r.range);
      const anchor = anchorFromRangeMd(r.range, container);
      if (anchor) {
        setSelection(null);
        setCard({ id: h.id, anchor });
      }
    },
    [articleRef, flashRange],
  );

  const commentHighlight = async (h: HighlightRow) => {
    try {
      await createComment(documentId, buildCommentFromHighlight(h));
      message.success('已发到本文评论');
    } catch {
      message.error('发送失败');
    }
  };

  /* ── Ordering + parent notification ─────────────────────────────────── */
  const ordered = useMemo(() => {
    const rows = [...highlights];
    rows.sort((a, b) => {
      const ra = resolvedRef.current.get(a.id);
      const rb = resolvedRef.current.get(b.id);
      if (ra && rb) return ra.start - rb.start;
      if (ra) return -1;
      if (rb) return 1;
      return a.created_at < b.created_at ? -1 : 1;
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights, resolveTick]);

  const invalidIds = useMemo(
    () => new Set(loaded ? highlights.filter((h) => !resolvedRef.current.get(h.id)).map((h) => h.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlights, resolveTick, loaded],
  );

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.({
      highlights: ordered,
      loaded,
      invalidIds,
      openHighlight,
      openExport: () => setExportOpen(true),
    });
  }, [ordered, loaded, invalidIds, openHighlight]);

  /* ── Deep link ?hl= ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (deepLinkDoneRef.current || !initialHlId || !loaded || resolveTick === 0) return;
    const h = highlightsRef.current.find((x) => x.id === initialHlId);
    deepLinkDoneRef.current = true;
    if (h) openHighlight(h);
  }, [initialHlId, loaded, resolveTick, openHighlight]);

  /* ── Render ─────────────────────────────────────────────────────────── */
  const container = articleRef.current;
  const stageW = container?.clientWidth ?? 0;
  const stageH = container?.offsetHeight ?? 0;
  const cardHighlight = card ? highlights.find((h) => h.id === card.id) ?? null : null;

  const aiSlot =
    aiOps && onAI && selection ? (
      <Dropdown
        trigger={['click']}
        placement="bottomLeft"
        overlayClassName="jz-editor-dropdown jz-ai-dropdown"
        popupRender={() => (
          <AIMenuList
            ops={aiOps}
            onSelect={(op) => {
              onAI(selection.text, op);
              finishSelection();
            }}
            extraItems={[
              {
                key: 'ask',
                label: '自由提问',
                hint: '基于选中内容问答',
                icon: <JzAiAskIcon size={18} />,
                onClick: () => {
                  onAI(selection.text, 'ask');
                  finishSelection();
                },
              },
            ]}
          />
        )}
      >
        <button type="button" className="jz-epub-selbtn" aria-label="AI 操作">
          <JzAiSparkIcon size={15} />
        </button>
      </Dropdown>
    ) : null;

  return (
    <>
      {enabled && selection && (
        <EpubSelectionBar
          anchor={selection.anchor}
          stageWidth={stageW}
          stageHeight={stageH}
          canHighlight={canPaint}
          lastColor={lastColor}
          onCopy={() => {
            void copyText(selection.text);
            finishSelection();
          }}
          onHighlight={(color, style) => void addHighlight(color, style)}
          onNote={() => void addHighlight(lastColor, 'highlight', true)}
          onQuote={() => {
            void copyText(quoteOf(selection.text), '已复制引用（Markdown）');
            finishSelection();
          }}
          aiSlot={aiSlot}
        />
      )}
      {enabled && card && cardHighlight && (
        <EpubHighlightCard
          key={cardHighlight.id}
          highlight={cardHighlight}
          anchor={card.anchor}
          stageWidth={stageW}
          stageHeight={stageH}
          autoFocusNote={card.focusNote}
          onChangeStyle={(patch) => void patchHighlight(cardHighlight.id, patch)}
          onSaveNote={(note) => patchHighlight(cardHighlight.id, { note })}
          onCopy={() => void copyText(cardHighlight.text)}
          onQuote={() => void copyText(quoteOf(cardHighlight.text, cardHighlight), '已复制引用（Markdown）')}
          onComment={() => void commentHighlight(cardHighlight)}
          onDelete={() => void removeHighlight(cardHighlight.id)}
          onClose={() => setCard(null)}
        />
      )}
      <EpubNotesExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        markdown={exportOpen ? buildNotesMarkdown({ title: docTitle, docId: documentId, highlights: ordered }) : ''}
        filename={notesFilename(docTitle)}
        title={docTitle}
        canCreateDoc={canCreateDoc}
      />
    </>
  );
}
