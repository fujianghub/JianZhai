/**
 * 题记管理面板 — list / edit / drag-reorder / batch-import / export.
 *
 * - Switch    : enabled (主开关；关闭后首页 hero 不显示题记)
 * - Slider    : rotation_seconds (1 – 60 秒)
 * - Radio     : animation (fade / slide / typewriter / ink-wash)
 * - Radio     : play_order (random / sequential，v0.9.10)
 * - Table     : rows render as styled text（正文衬线 + 三色署名，复用首页
 *               .jz-hero-cite-* 样式）；click a row（或编辑按钮）切换为该行
 *               编辑态。新增 = 顶部草稿行（正文留空不落库，首次填写并失焦
 *               才提交）。搜索框按正文/朝代/作者/篇名过滤；表体内滚动
 *               （56vh sticky 表头）。whole-row drag-reorder（dnd-kit handle
 *               column，过滤时禁用）、delete。
 * - Modal     : 批量导入（textarea, replace / append 模式）
 * - Modal     : 导出（反向生成批量导入格式文本，复制 / 下载）
 * - Preview   : live HeroQuoteCard，可 ‹ › 翻看任意一条的渲染效果
 *
 * Saves are debounced — every commit-able change (Slider release, Radio
 * click, row focus-out, drag drop) calls PATCH /auth/hero/.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, AutoComplete, Button, Card, DatePicker, Input, Modal, Popconfirm, Radio, Slider, Space, Switch, Table, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import {
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ExportOutlined,
  HolderOutlined,
  ImportOutlined,
  LeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import {
  type HeroAnimation,
  type HeroPlayOrder,
  type HeroQuote,
  type HeroSettings,
  batchImportHero,
  getHeroSettings,
  patchHeroSettings,
} from '@/api/hero';
import { formatApiError } from '@/api/client';
import { message } from '@/utils/notify';
import { quotesToBatchText } from '@/utils/heroPlayback';
import { HeroQuoteCard } from '@/components/blog/HeroQuoteRotator';
import { formatShortcut, getChord, matchesChord } from '@/shortcuts';
import IconButton from '@/components/common/IconButton';
import JzEmpty from '@/components/common/JzEmpty';

const { Text } = Typography;
const { TextArea } = Input;

const ANIM_LABELS: Record<HeroAnimation, string> = {
  fade: '淡入',
  slide: '上滑',
  typewriter: '打字机',
  'ink-wash': '水墨',
};

const PLAY_ORDER_LABELS: Record<HeroPlayOrder, string> = {
  random: '随机',
  sequential: '顺序',
};

/** 常用朝代下拉候选 — 19 项，按时间顺序排列。
 *  AutoComplete 仍允许用户自由输入（如 "modern" / "民国" 等），
 *  下拉只是省去手敲常用值。 */
const DYNASTY_OPTIONS: { value: string }[] = [
  { value: '先秦' },
  { value: '春秋' },
  { value: '战国' },
  { value: '秦' },
  { value: '汉' },
  { value: '三国' },
  { value: '晋' },
  { value: '南北朝' },
  { value: '隋' },
  { value: '唐' },
  { value: '五代十国' },
  { value: '宋' },
  { value: '辽' },
  { value: '金' },
  { value: '元' },
  { value: '明' },
  { value: '清' },
  { value: '近代' },
  { value: '现代' },
];

const SAMPLE_BATCH = `# 行首 # 开头为注释；空行忽略
# 格式：正文 — [朝代]作者 · 篇名 @摘录日期
#
# 分隔符（优先级 高 → 低）：
#   1. 全角/半角破折号  —  –  -
#   2. 单词 "by"
#   3. 中圆点  ·  •（仅当行内无破折号时）
# 朝代可选，写在「作者」前并用 [xxx] / 〔xxx〕 / 【xxx】 / (xxx) 包裹。
# 行尾可加 @YYYY-MM-DD 记录摘录日期（心境时间戳，首页展示；缺省不记）。
# 正文内写 \n 表示换行（多行题记，导出会自动转义）。
莫听穿林打叶声 — [宋]苏轼 · 定风波 @2026-08-10
臣本布衣 — 〔三国〕诸葛亮 · 出师表
人生如逆旅，我亦是行人 - 苏轼 · 临江仙
天行健，君子以自强不息 by 周易
仰之弥高，钻之弥坚 · 论语
`;

// ── dnd-kit table row — drag activates only from the handle cell, so the
//    inline <Input> fields keep normal text-selection behaviour. Same
//    pattern as the AntD 5 "drag handle" sortable-table recipe.
interface RowContextProps {
  setActivatorNodeRef?: (element: HTMLElement | null) => void;
  listeners?: SyntheticListenerMap;
}

const RowContext = createContext<RowContextProps>({});

function DragHandle({ disabled }: { disabled: boolean }) {
  const { setActivatorNodeRef, listeners } = useContext(RowContext);
  return (
    <IconButton
      className="jz-hero-drag-handle"
      icon={<HolderOutlined />}
      disabled={disabled}
      style={{ cursor: disabled ? 'not-allowed' : 'grab', touchAction: 'none' }}
      ref={setActivatorNodeRef}
      {...(disabled ? {} : listeners)}
      aria-label="拖动排序"
    />
  );
}

interface DraggableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  'data-row-key': string;
}

function DraggableRow(props: DraggableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props['data-row-key'] });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9 } : {}),
  };

  const contextValue = useMemo<RowContextProps>(
    () => ({ setActivatorNodeRef, listeners }),
    [setActivatorNodeRef, listeners],
  );

  return (
    <RowContext.Provider value={contextValue}>
      <tr
        {...props}
        ref={setNodeRef}
        style={style}
        className={`${props.className ?? ''}${isDragging ? ' jz-hero-row-dragging' : ''}`}
        {...attributes}
      />
    </RowContext.Provider>
  );
}

export default function HeroSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const [data, setData] = useState<HeroSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewTick, setPreviewTick] = useState(0);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [batchOpen, setBatchOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  /** Row currently showing inputs; all other rows render as styled text. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Uncommitted new quote — lives OUTSIDE data.quotes because the server
   *  silently drops empty-text quotes: if the draft rode along in another
   *  row's PATCH, the response setData() would erase it mid-typing. It is
   *  promoted into the real list on the first commit with non-empty text. */
  const [draft, setDraft] = useState<HeroQuote | null>(null);
  /** List filter — matches 正文/朝代/作者/篇名, case-insensitive. */
  const [filter, setFilter] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await getHeroSettings();
      setData(fresh);
    } catch (err) {
      message.error(formatApiError(err, '加载题记设置失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Commit helpers ───────────────────────────────────────────────────
  const commit = useCallback(
    async (
      patch: Partial<
        Pick<HeroSettings, 'enabled' | 'rotation_seconds' | 'animation' | 'play_order' | 'quotes'>
      >,
    ) => {
      if (!data) return;
      setSaving(true);
      try {
        const fresh = await patchHeroSettings(patch);
        setData(fresh);
        setPreviewTick((n) => n + 1);
      } catch (err) {
        message.error(formatApiError(err, '保存失败'));
      } finally {
        setSaving(false);
      }
    },
    [data],
  );

  // ── Quote edits — kept local then committed on blur / drop / delete.
  const setLocalQuotes = (next: HeroQuote[]) => {
    if (!data) return;
    setData({ ...data, quotes: next });
    setPreviewTick((n) => n + 1);
  };

  const onRowChange = (
    id: string,
    field: 'text' | 'dynasty' | 'author' | 'source' | 'created_at',
    value: string,
  ) => {
    if (draft && id === draft.id) {
      setDraft({ ...draft, [field]: value });
      return;
    }
    if (!data) return;
    setLocalQuotes(data.quotes.map((q) => (q.id === id ? { ...q, [field]: value } : q)));
  };

  // Draft → real quote at the TOP of the list. No-op while text is empty
  // (the server would drop it anyway); the draft just stays local.
  const promoteDraft = () => {
    if (!data || !draft) return;
    const text = draft.text.trim();
    if (!text) return;
    const next = [{ ...draft, text }, ...data.quotes];
    setDraft(null);
    setLocalQuotes(next);
    setPreviewIdx(0); // preview jumps to the freshly added quote
    void commit({ quotes: next });
  };

  /** Commit a row when focus leaves it (or on Enter / ✓). */
  const commitRow = (id: string) => {
    if (draft && id === draft.id) {
      promoteDraft();
      return;
    }
    if (!data) return;
    void commit({ quotes: data.quotes });
  };

  const onAdd = () => {
    if (!data || !canEdit) return;
    setFilter('');
    if (draft) {
      // Only one draft at a time — re-focus it instead of stacking another.
      setEditingId(draft.id);
      return;
    }
    const next: HeroQuote = {
      id: `local-${Date.now().toString(36)}`,
      text: '',
      dynasty: '',
      author: '',
      source: '',
    };
    setDraft(next);
    setEditingId(next.id);
  };

  const onDelete = (id: string) => {
    if (editingId === id) setEditingId(null);
    if (draft && id === draft.id) {
      setDraft(null); // uncommitted — discard locally, nothing to PATCH
      return;
    }
    if (!data) return;
    const next = data.quotes.filter((q) => q.id !== id);
    setLocalQuotes(next);
    void commit({ quotes: next });
  };

  // ── Drag reorder — arrayMove between the dragged row and its drop slot,
  //    then commit the whole list in one PATCH (same as the old 上移/下移).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const filterNorm = filter.trim().toLowerCase();

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    // Reorder is disabled while filtering — the visible indexes wouldn't
    // map back onto the full authored list.
    if (!data || !canEdit || filterNorm || !over || active.id === over.id) return;
    const from = data.quotes.findIndex((q) => q.id === active.id);
    const to = data.quotes.findIndex((q) => q.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(data.quotes, from, to);
    setLocalQuotes(next);
    void commit({ quotes: next });
  };

  // ── Row list for the table — draft (if any) pinned on top, then the
  //    authored list, optionally narrowed by the filter box. The draft is
  //    always visible so it can't get "lost" behind an active filter.
  const visibleRows = useMemo<HeroQuote[]>(() => {
    const base = draft ? [draft, ...(data?.quotes ?? [])] : data?.quotes ?? [];
    if (!filterNorm) return base;
    return base.filter(
      (q) =>
        (draft && q.id === draft.id) ||
        [q.text, q.dynasty, q.author, q.source].some((v) =>
          (v || '').toLowerCase().includes(filterNorm),
        ),
    );
  }, [data, draft, filterNorm]);

  // ── Batch import modal ───────────────────────────────────────────────
  const [batchText, setBatchText] = useState(SAMPLE_BATCH);
  const [batchMode, setBatchMode] = useState<'replace' | 'append'>('append');
  const [batchSaving, setBatchSaving] = useState(false);
  const onBatchSubmit = async () => {
    setBatchSaving(true);
    try {
      const fresh = await batchImportHero(batchText, batchMode);
      setData(fresh);
      setPreviewTick((n) => n + 1);
      setBatchOpen(false);
      message.success(`已${batchMode === 'replace' ? '替换为' : '追加'} ${fresh.quotes.length} 条题记`);
    } catch (err) {
      message.error(formatApiError(err, '批量导入失败'));
    } finally {
      setBatchSaving(false);
    }
  };

  // ── Export — reverse of the batch parser; copy or download as .txt.
  const exportText = useMemo(() => (data ? quotesToBatchText(data.quotes) : ''), [data]);

  const onCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动选择文本复制');
    }
  };

  const onDownloadExport = () => {
    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `简斋题记备份-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ── Preview snapshot — ‹ › steps through every quote so each one's
  //    rendering (long lines, missing author, …) can be checked.
  const quoteCount = data?.quotes.length ?? 0;
  const previewQuote = useMemo<HeroQuote | null>(() => {
    if (!data || quoteCount === 0) return null;
    return data.quotes[((previewIdx % quoteCount) + quoteCount) % quoteCount];
  }, [data, previewIdx, quoteCount]);

  const stepPreview = (delta: -1 | 1) => {
    if (quoteCount <= 1) return;
    setPreviewIdx((i) => i + delta);
    setPreviewTick((n) => n + 1);
  };

  if (loading || !data) {
    return (
      <Card>
        <Text type="secondary">加载中…</Text>
      </Card>
    );
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {!canEdit && (
        <Alert
          showIcon
          type="info"
          message="只有管理员可以修改题记。"
          description="非管理员账号下方控件均为只读，预览仍按当前线上配置渲染。"
        />
      )}

      {/* ── Live preview — wrapped in a 宣纸-style frame so the admin
            sees roughly what the blog homepage will render. ─────────── */}
      <Card
        title="实时预览"
        size="small"
        className="jz-hero-admin-card"
        extra={
          <Space size={4}>
            <Tooltip title="上一条">
              <IconButton
                icon={<LeftOutlined />}
                disabled={quoteCount <= 1}
                onClick={() => stepPreview(-1)}
              />
            </Tooltip>
            <Text type="secondary" style={{ fontSize: 12, minWidth: 64, textAlign: 'center' }}>
              {quoteCount === 0
                ? '无题记'
                : `第 ${((previewIdx % quoteCount) + quoteCount) % quoteCount + 1} / ${quoteCount} 条`}
            </Text>
            <Tooltip title="下一条">
              <IconButton
                icon={<RightOutlined />}
                disabled={quoteCount <= 1}
                onClick={() => stepPreview(1)}
              />
            </Tooltip>
            <Tooltip title="重播预览动画">
              <IconButton
                icon={<ReloadOutlined />}
                onClick={() => setPreviewTick((n) => n + 1)}
              />
            </Tooltip>
          </Space>
        }
      >
        {previewQuote ? (
          <div className="jz-hero-preview-frame">
            <HeroQuoteCard quote={previewQuote} animation={data.animation} animationKey={previewTick} />
          </div>
        ) : (
          <JzEmpty description="没有题记，先添加一条或批量导入" size="sm" />
        )}
      </Card>

      {/* ── Master controls ─────────────────────────────────────────── */}
      <Card size="small" title="主控" className="jz-hero-admin-card">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Text strong>启用题记</Text>
            <Switch
              checked={data.enabled}
              disabled={!canEdit || saving}
              onChange={(v) => void commit({ enabled: v })}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              关闭后首页隐藏题记区，但保留藏经阁标题。
            </Text>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text strong>轮播周期</Text>
              <Text type="secondary">
                {data.rotation_seconds} 秒 / 条（单条题记则始终静止）
              </Text>
            </div>
            <Slider
              min={1}
              max={60}
              value={data.rotation_seconds}
              disabled={!canEdit || saving}
              onChange={(v) => setData({ ...data, rotation_seconds: v as number })}
              onChangeComplete={(v) => void commit({ rotation_seconds: v as number })}
              tooltip={{ formatter: (v) => `${v} 秒` }}
              marks={{ 1: '1 s', 8: '8 s', 30: '30 s', 60: '60 s' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Text strong>动画样式</Text>
            <Radio.Group
              value={data.animation}
              disabled={!canEdit || saving}
              onChange={(e) => void commit({ animation: e.target.value as HeroAnimation })}
              optionType="button"
              buttonStyle="solid"
            >
              {(data.animations || (Object.keys(ANIM_LABELS) as HeroAnimation[])).map((a) => (
                <Radio.Button key={a} value={a}>
                  {ANIM_LABELS[a] ?? a}
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Text strong>播放顺序</Text>
            <Radio.Group
              value={data.play_order}
              disabled={!canEdit || saving}
              onChange={(e) => void commit({ play_order: e.target.value as HeroPlayOrder })}
              optionType="button"
              buttonStyle="solid"
            >
              {(data.play_orders || (Object.keys(PLAY_ORDER_LABELS) as HeroPlayOrder[])).map((o) => (
                <Radio.Button key={o} value={o}>
                  {PLAY_ORDER_LABELS[o] ?? o}
                </Radio.Button>
              ))}
            </Radio.Group>
            <Text type="secondary" style={{ fontSize: 12 }}>
              随机 = 每次打开页面重新洗牌，整轮不重复；顺序 = 按下方列表排列播放。
            </Text>
          </div>
        </Space>
      </Card>

      {/* ── Quote list — styled display rows, click a row to edit. ──── */}
      <Card
        size="small"
        className="jz-hero-admin-card"
        title={
          filterNorm
            ? `题记列表（匹配 ${visibleRows.filter((r) => r.id !== draft?.id).length} / 共 ${data.quotes.length} 条）`
            : `题记列表（共 ${data.quotes.length} 条）`
        }
        extra={
          <Space>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: 'var(--jz-text-muted)' }} />}
              placeholder="搜索正文 / 作者…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ width: 180 }}
            />
            <Button icon={<ExportOutlined />} onClick={() => setExportOpen(true)}>
              导出
            </Button>
            <Button
              icon={<ImportOutlined />}
              disabled={!canEdit}
              onClick={() => setBatchOpen(true)}
            >
              批量导入
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!canEdit}
              onClick={() => onAdd()}
            >
              新增
            </Button>
          </Space>
        }
      >
        <DndContext
          sensors={sensors}
          modifiers={[restrictToVerticalAxis]}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={visibleRows.map((q) => q.id)}
            strategy={verticalListSortingStrategy}
          >
            <Table<HeroQuote>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={visibleRows}
              components={{ body: { row: DraggableRow } }}
              scroll={{ y: '56vh' }}
              rowClassName={(r) => (r.id === editingId ? 'jz-hero-row-editing' : '')}
              locale={{
                emptyText: filterNorm
                  ? '没有匹配的题记'
                  : '无题记，点击右上角「新增」或「批量导入」',
              }}
              columns={[
                {
                  title: '',
                  dataIndex: 'sort',
                  width: 40,
                  render: (_: unknown, r) => (
                    <DragHandle disabled={!canEdit || !!filterNorm || r.id === draft?.id} />
                  ),
                },
                {
                  title: '#',
                  dataIndex: 'idx',
                  width: 44,
                  render: (_: unknown, r) =>
                    r.id === draft?.id ? (
                      <Text type="secondary">新</Text>
                    ) : (
                      <Text type="secondary">
                        {data.quotes.findIndex((q) => q.id === r.id) + 1}
                      </Text>
                    ),
                },
                {
                  title: '题记',
                  dataIndex: 'text',
                  render: (_: string, r) => {
                    if (canEdit && editingId === r.id) {
                      return (
                        <div
                          className="jz-hero-admin-edit"
                          onBlur={(e) => {
                            // Commit only when focus leaves the whole row —
                            // tabbing 正文→朝代 must NOT fire a PATCH whose
                            // response would clobber in-flight keystrokes.
                            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                              commitRow(r.id);
                            }
                          }}
                        >
                          <TextArea
                            value={r.text}
                            autoFocus
                            placeholder="正文（最多 200 字，可换行）"
                            autoSize={{ minRows: 1, maxRows: 5 }}
                            onChange={(e) => onRowChange(r.id, 'text', e.target.value)}
                            onKeyDown={(e) => {
                              // Enter inserts a line break (多行题记)；
                              // Ctrl/⌘+Enter commits and closes the row.
                              if (matchesChord(e.nativeEvent, getChord('admin.hero.save'))) {
                                e.preventDefault();
                                commitRow(r.id);
                                setEditingId(null);
                              }
                            }}
                          />
                          <Space size={6} wrap style={{ marginTop: 6 }}>
                            <AutoComplete
                              value={r.dynasty}
                              placeholder="朝代"
                              options={DYNASTY_OPTIONS}
                              filterOption={(input, option) =>
                                !input || (option?.value ?? '').includes(input)
                              }
                              onChange={(val) => onRowChange(r.id, 'dynasty', val)}
                              style={{ width: 110 }}
                            />
                            <Input
                              value={r.author}
                              placeholder="作者"
                              onChange={(e) => onRowChange(r.id, 'author', e.target.value)}
                              style={{ width: 130 }}
                            />
                            <Input
                              value={r.source}
                              placeholder="篇名"
                              onChange={(e) => onRowChange(r.id, 'source', e.target.value)}
                              style={{ width: 150 }}
                            />
                            <DatePicker
                              value={r.created_at ? dayjs(r.created_at) : null}
                              placeholder="摘录日期"
                              allowClear
                              onChange={(d) =>
                                onRowChange(r.id, 'created_at', d ? d.format('YYYY-MM-DD') : '')
                              }
                              style={{ width: 132 }}
                            />
                          </Space>
                        </div>
                      );
                    }
                    // Display mode — front-page serif + tri-color cite so
                    // the list doubles as a per-row preview.
                    const hasSplit = !!(r.dynasty || r.author || r.source);
                    const legacy = !hasSplit ? (r.attribution || '').trim() : '';
                    const created = (r.created_at || '').trim();
                    const updated = (r.updated_at || '').trim();
                    return (
                      <div
                        className="jz-hero-admin-row"
                        onClick={canEdit ? () => setEditingId(r.id) : undefined}
                      >
                        <div className="jz-hero-admin-row-text">
                          {r.text || <Text type="secondary">（未填写正文）</Text>}
                        </div>
                        {(hasSplit || legacy || created || updated) && (
                          <div className="jz-hero-cite-inner jz-hero-admin-row-cite">
                            {r.dynasty && (
                              <span className="jz-hero-cite-dynasty">
                                <span aria-hidden>〔</span>
                                <span>{r.dynasty}</span>
                                <span aria-hidden>〕</span>
                              </span>
                            )}
                            {r.author && <span className="jz-hero-cite-author">{r.author}</span>}
                            {r.source && (
                              <span className="jz-hero-cite-source">
                                <span aria-hidden>〈</span>
                                <span>{r.source}</span>
                                <span aria-hidden>〉</span>
                              </span>
                            )}
                            {legacy && <span className="jz-hero-cite-author">{legacy}</span>}
                            {(created || updated) && (
                              <span className="jz-hero-admin-row-date">
                                {created && `摘录于 ${created}`}
                                {updated && updated !== created
                                  ? `${created ? ' · ' : ''}改于 ${updated}`
                                  : ''}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  },
                },
                {
                  title: '操作',
                  dataIndex: 'ops',
                  width: 84,
                  render: (_: unknown, r) => (
                    <Space size={0}>
                      {editingId === r.id ? (
                        <Tooltip title="完成">
                          <IconButton
                            icon={<CheckOutlined />}
                            aria-label="完成"
                            onClick={() => {
                              // Empty draft on ✓ = the user changed their
                              // mind — discard instead of stranding a blank
                              // row (row blur has already committed filled
                              // drafts before this click lands).
                              if (draft && r.id === draft.id && !draft.text.trim()) {
                                setDraft(null);
                              }
                              setEditingId(null);
                            }}
                          />
                        </Tooltip>
                      ) : (
                        <Tooltip title="编辑">
                          <IconButton
                            icon={<EditOutlined />}
                            aria-label="编辑"
                            disabled={!canEdit}
                            onClick={() => setEditingId(r.id)}
                          />
                        </Tooltip>
                      )}
                      {r.id === draft?.id ? (
                        <IconButton
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => onDelete(r.id)}
                          aria-label="放弃新题记"
                        />
                      ) : (
                        <Popconfirm
                          title="删除该题记？"
                          okText="删除"
                          cancelText="取消"
                          onConfirm={() => onDelete(r.id)}
                          disabled={!canEdit}
                        >
                          <IconButton
                            danger
                            icon={<DeleteOutlined />}
                            disabled={!canEdit}
                          />
                        </Popconfirm>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          </SortableContext>
        </DndContext>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          点击行进入编辑，焦点移出或 {formatShortcut('admin.hero.save')} 保存（正文内回车 = 换行）；按住行首 ⠿
          拖动可调整顺序（「顺序」播放模式按此排列，搜索过滤时暂不可拖动）。
        </Text>
      </Card>

      {/* ── Batch import modal ──────────────────────────────────────── */}
      <Modal
        title="批量导入题记"
        open={batchOpen}
        onCancel={() => setBatchOpen(false)}
        onOk={() => void onBatchSubmit()}
        okButtonProps={{ loading: batchSaving }}
        okText={batchMode === 'replace' ? '替换全部' : '追加'}
        width={680}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Radio.Group
            value={batchMode}
            onChange={(e) => setBatchMode(e.target.value as 'replace' | 'append')}
          >
            <Radio.Button value="append">追加在现有之后</Radio.Button>
            <Radio.Button value="replace">替换全部题记</Radio.Button>
          </Radio.Group>
          <Text type="secondary" style={{ fontSize: 12 }}>
            每行一条题记。分隔符优先级：<code>—</code> <code>–</code> <code>-</code> &gt; <code>by</code> &gt; <code>·</code> <code>•</code>。
            行首 <code>#</code> 视为注释。
            朝代可选，写在「作者」前用 <code>[xxx]</code> / <code>〔xxx〕</code> / <code>【xxx】</code> / <code>(xxx)</code> 包裹。
            行尾可加 <code>@YYYY-MM-DD</code> 记录摘录日期（缺省不记，之后可在列表中逐条补填）；
            正文内 <code>\n</code> 表示换行。
          </Text>
          <TextArea
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            autoSize={{ minRows: 8, maxRows: 16 }}
            spellCheck={false}
            style={{ fontFamily: 'var(--jz-font-mono)' }}
          />
        </Space>
      </Modal>

      {/* ── Export modal — same line format the batch importer accepts,
            so the file doubles as a backup that re-imports cleanly. ──── */}
      <Modal
        title="导出题记"
        open={exportOpen}
        onCancel={() => setExportOpen(false)}
        footer={
          <Space>
            <Button icon={<CopyOutlined />} onClick={() => void onCopyExport()}>
              复制
            </Button>
            <Button type="primary" icon={<DownloadOutlined />} onClick={onDownloadExport}>
              下载 .txt
            </Button>
          </Space>
        }
        width={680}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {data.quotes.length} 条，格式与「批量导入」一致——保存为文本即可作为备份，
            之后用「批量导入 · 替换全部」一键还原。
          </Text>
          <TextArea
            value={exportText}
            readOnly
            autoSize={{ minRows: 8, maxRows: 16 }}
            spellCheck={false}
            style={{ fontFamily: 'var(--jz-font-mono)' }}
          />
        </Space>
      </Modal>
    </Space>
  );
}
