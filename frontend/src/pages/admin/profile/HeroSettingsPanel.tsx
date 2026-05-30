/**
 * 题记管理面板 — list / edit / reorder / batch-import.
 *
 * - Switch    : enabled (主开关；关闭后首页 hero 不显示题记)
 * - Slider    : rotation_seconds (1 – 60 秒)
 * - Radio     : animation (fade / slide / typewriter / zoom)
 * - Table     : per-quote text + attribution, inline-edit, drag-reorder, delete
 * - Modal     : 批量导入（textarea, replace / append 模式）
 * - Preview   : live HeroQuoteCard with the current draft applied
 *
 * Saves are debounced — every commit-able change (Slider release, Radio
 * click, row blur, sort) calls PATCH /auth/hero/. The Save button only
 * matters when the user makes inline edits and wants to commit early.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Slider,
  Space,
  Switch,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  ImportOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  type HeroAnimation,
  type HeroQuote,
  type HeroSettings,
  batchImportHero,
  getHeroSettings,
  patchHeroSettings,
} from '@/api/hero';
import { formatApiError } from '@/api/client';
import { message } from '@/utils/notify';
import { HeroQuoteCard } from '@/components/blog/HeroQuoteRotator';

const { Text } = Typography;
const { TextArea } = Input;

const ANIM_LABELS: Record<HeroAnimation, string> = {
  fade: '淡入',
  slide: '上滑',
  typewriter: '打字机',
  'ink-wash': '水墨',
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
# 格式：正文 — [朝代]作者 · 篇名
#
# 分隔符（优先级 高 → 低）：
#   1. 全角/半角破折号  —  –  -
#   2. 单词 "by"
#   3. 中圆点  ·  •（仅当行内无破折号时）
# 朝代可选，写在「作者」前并用 [xxx] / 〔xxx〕 / 【xxx】 / (xxx) 包裹。
莫听穿林打叶声 — [宋]苏轼 · 定风波
臣本布衣 — 〔三国〕诸葛亮 · 出师表
人生如逆旅，我亦是行人 - 苏轼 · 临江仙
天行健，君子以自强不息 by 周易
仰之弥高，钻之弥坚 · 论语
`;

export default function HeroSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const [data, setData] = useState<HeroSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewTick, setPreviewTick] = useState(0);
  const [batchOpen, setBatchOpen] = useState(false);

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
    async (patch: Partial<Pick<HeroSettings, 'enabled' | 'rotation_seconds' | 'animation' | 'quotes'>>) => {
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

  // ── Quote edits — kept local then committed on blur / sort / delete.
  const setLocalQuotes = (next: HeroQuote[]) => {
    if (!data) return;
    setData({ ...data, quotes: next });
    setPreviewTick((n) => n + 1);
  };

  const onRowChange = (
    id: string,
    field: 'text' | 'dynasty' | 'author' | 'source',
    value: string,
  ) => {
    if (!data) return;
    setLocalQuotes(data.quotes.map((q) => (q.id === id ? { ...q, [field]: value } : q)));
  };

  const onRowCommit = () => {
    if (!data) return;
    void commit({ quotes: data.quotes });
  };

  const onAdd = () => {
    if (!data) return;
    const next: HeroQuote = {
      id: `local-${Date.now().toString(36)}`,
      text: '新题记',
      dynasty: '',
      author: '',
      source: '',
    };
    const draft = [...data.quotes, next];
    setLocalQuotes(draft);
    void commit({ quotes: draft });
  };

  const onDelete = (id: string) => {
    if (!data) return;
    const draft = data.quotes.filter((q) => q.id !== id);
    setLocalQuotes(draft);
    void commit({ quotes: draft });
  };

  const onMove = (id: string, delta: -1 | 1) => {
    if (!data) return;
    const idx = data.quotes.findIndex((q) => q.id === id);
    if (idx < 0) return;
    const next = idx + delta;
    if (next < 0 || next >= data.quotes.length) return;
    const draft = [...data.quotes];
    [draft[idx], draft[next]] = [draft[next], draft[idx]];
    setLocalQuotes(draft);
    void commit({ quotes: draft });
  };

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

  // ── Preview snapshot ─────────────────────────────────────────────────
  const previewQuote = useMemo<HeroQuote | null>(() => {
    if (!data || data.quotes.length === 0) return null;
    return data.quotes[0];
  }, [data]);

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
      <Card title="实时预览" size="small" extra={<Text type="secondary">动画 / 题记顺序变更会立刻反映</Text>}>
        {previewQuote ? (
          <div className="jz-hero-preview-frame">
            <HeroQuoteCard quote={previewQuote} animation={data.animation} animationKey={previewTick} />
          </div>
        ) : (
          <Empty description="没有题记，先添加一条或批量导入" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      {/* ── Master controls ─────────────────────────────────────────── */}
      <Card size="small" title="主控">
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

          <div>
            <Text strong style={{ marginRight: 12 }}>动画样式</Text>
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
            <Tooltip title="重播预览动画">
              <Button
                type="text"
                icon={<ReloadOutlined />}
                onClick={() => setPreviewTick((n) => n + 1)}
                style={{ marginLeft: 8 }}
              />
            </Tooltip>
          </div>
        </Space>
      </Card>

      {/* ── Quote list ──────────────────────────────────────────────── */}
      <Card
        size="small"
        title={`题记列表（共 ${data.quotes.length} 条）`}
        extra={
          <Space>
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
        <Table<HeroQuote>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={data.quotes}
          locale={{ emptyText: '无题记，点击右上角「新增」或「批量导入」' }}
          columns={[
            {
              title: '#',
              dataIndex: 'idx',
              width: 44,
              render: (_: unknown, _r, i: number) => <Text type="secondary">{i + 1}</Text>,
            },
            {
              title: '题记正文',
              dataIndex: 'text',
              render: (v: string, r) => (
                <Input
                  value={v}
                  placeholder="正文（最多 200 字）"
                  disabled={!canEdit}
                  onChange={(e) => onRowChange(r.id, 'text', e.target.value)}
                  onBlur={() => onRowCommit()}
                />
              ),
            },
            {
              title: '朝代',
              dataIndex: 'dynasty',
              width: 110,
              render: (v: string, r) => (
                <AutoComplete
                  value={v}
                  placeholder="如：三国"
                  disabled={!canEdit}
                  options={DYNASTY_OPTIONS}
                  filterOption={(input, option) =>
                    !input || (option?.value ?? '').includes(input)
                  }
                  onChange={(val) => onRowChange(r.id, 'dynasty', val)}
                  onBlur={() => onRowCommit()}
                  style={{ width: '100%' }}
                />
              ),
            },
            {
              title: '作者',
              dataIndex: 'author',
              width: 130,
              render: (v: string, r) => (
                <Input
                  value={v}
                  placeholder="如：诸葛亮"
                  disabled={!canEdit}
                  onChange={(e) => onRowChange(r.id, 'author', e.target.value)}
                  onBlur={() => onRowCommit()}
                />
              ),
            },
            {
              title: '篇名',
              dataIndex: 'source',
              width: 150,
              render: (v: string, r) => (
                <Input
                  value={v}
                  placeholder="如：诫子书"
                  disabled={!canEdit}
                  onChange={(e) => onRowChange(r.id, 'source', e.target.value)}
                  onBlur={() => onRowCommit()}
                />
              ),
            },
            {
              title: '操作',
              dataIndex: 'ops',
              width: 130,
              render: (_: unknown, r, i: number) => (
                <Space size={2}>
                  <Tooltip title="上移">
                    <Button
                      size="small"
                      type="text"
                      icon={<ArrowUpOutlined />}
                      disabled={!canEdit || i === 0}
                      onClick={() => onMove(r.id, -1)}
                    />
                  </Tooltip>
                  <Tooltip title="下移">
                    <Button
                      size="small"
                      type="text"
                      icon={<ArrowDownOutlined />}
                      disabled={!canEdit || i === data.quotes.length - 1}
                      onClick={() => onMove(r.id, 1)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="删除该题记？"
                    okText="删除"
                    cancelText="取消"
                    onConfirm={() => onDelete(r.id)}
                    disabled={!canEdit}
                  >
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={!canEdit}
                    />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
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
          </Text>
          <TextArea
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            autoSize={{ minRows: 8, maxRows: 16 }}
            spellCheck={false}
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
          />
        </Space>
      </Modal>
    </Space>
  );
}
