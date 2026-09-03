/**
 * /admin/toc — 目录设置（站点级默认）。
 *
 * Three columns of intent: what it governs (scope chips in the header), the
 * defaults themselves (排版 / 字体画廊 / 颜色与显示 — grouped, each row
 * explained), and a live preview that mimics the reading page's right rail
 * plus a KB tree fragment so 显示篇数 / guide lines are visible. Saves to the
 * ``TocSettings`` singleton; readers keep any key they overrode locally.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Segmented, Space, Spin, Switch, Tooltip, Typography } from 'antd';
import { CheckOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { JzTocIcon } from '@/components/common/JzIconKit';
import Disclosure from '@/components/common/Disclosure';
import { formatApiError } from '@/api/client';
import { getTocSettings, patchTocSettings } from '@/api/tocSettings';
import { useAuthStore } from '@/stores/auth';
import { useTocSettingsStore } from '@/stores/tocSettings';
import { message } from '@/utils/notify';
import {
  DEFAULT_TOC_PREFS,
  TOC_FONT_OPTIONS,
  relativeTocLevel,
  tocFontFamily,
  type TocDepth,
  type TocPrefs,
} from '@/utils/tocPrefs';

const { Text } = Typography;

const SAMPLE: { level: number; numbering: string; text: string }[] = [
  { level: 2, numbering: '1', text: '缘起' },
  { level: 3, numbering: '1.1', text: '一份内容，两种形态' },
  { level: 3, numbering: '1.2', text: '知识库与博客的边界：一个足够长的标题用来看换行与省略' },
  { level: 4, numbering: '1.2.1', text: '角色与共享内容池' },
  { level: 4, numbering: '1.2.2', text: '读者受众可见性' },
  { level: 2, numbering: '2', text: '编辑器' },
  { level: 3, numbering: '2.1', text: '富文本 · Markdown · HTML' },
  { level: 3, numbering: '2.2', text: '章节编号与 [TOC]' },
  { level: 2, numbering: '3', text: '阅读器' },
  { level: 3, numbering: '3.1', text: 'PDF · PPT · EPUB' },
];

const KB_SAMPLE: { level: number; kind: 'folder' | 'doc'; text: string; count?: number; open?: boolean }[] = [
  { level: 1, kind: 'folder', text: '网络基础', count: 12, open: true },
  { level: 2, kind: 'doc', text: 'OSPF 邻居状态机' },
  { level: 2, kind: 'folder', text: 'BGP', count: 5, open: true },
  { level: 3, kind: 'doc', text: '路由反射器与联邦' },
  { level: 3, kind: 'doc', text: '选路十三条' },
  { level: 1, kind: 'folder', text: '数据中心', count: 8, open: false },
];

function navProps(prefs: TocPrefs) {
  return {
    'data-density': prefs.density,
    'data-size': prefs.size,
    'data-wrap': prefs.wrap ? 'on' : 'off',
    'data-font': prefs.font,
    'data-color': prefs.color,
    'data-weight': prefs.weight,
    style: { ['--jz-font-toc' as string]: tocFontFamily(prefs.font) } as React.CSSProperties,
  };
}

function ArticlePreview({ prefs }: { prefs: TocPrefs }) {
  const minLevel = Math.min(...SAMPLE.map((e) => e.level));
  return (
    <div className="jz-toc-preview-rail">
      <div className="jz-toc-preview-tabs" aria-hidden>
        <span className="is-on">目录</span>
        <span>笔记 3</span>
      </div>
      <nav className="jz-epub-toc jz-article-toc jz-toc-preview" aria-label="目录预览" {...navProps(prefs)}>
        <ul className="jz-epub-toc-list">
          {SAMPLE.map((e, i) => {
            const rel = relativeTocLevel(e.level, minLevel);
            if (rel > prefs.depth) return null;
            return (
              <li key={i} className={`jz-epub-toc-item is-l${rel}`} style={{ ['--jz-toc-depth' as string]: rel - 1 } as React.CSSProperties}>
                <span className={'jz-epub-toc-link is-static' + (i === 2 ? ' is-active' : '')}>
                  {prefs.numbers ? <span className="jz-epub-toc-num">{e.numbering}</span> : null}
                  <span className="jz-epub-toc-text">{e.text}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function KbPreview({ prefs }: { prefs: TocPrefs }) {
  return (
    <div className="jz-toc-preview-rail">
      <div className="jz-toc-preview-tabs" aria-hidden>
        <span className="is-on">目录</span>
      </div>
      <nav className="jz-epub-toc jz-kb-toc jz-toc-preview" aria-label="知识库目录预览" {...navProps(prefs)}>
        <ul className="jz-epub-toc-list">
          {KB_SAMPLE.map((e, i) => (
            <li key={i} className={`jz-epub-toc-item is-l${e.level}`} style={{ ['--jz-toc-depth' as string]: e.level - 1 } as React.CSSProperties}>
              <span className={'jz-epub-toc-chevron' + (e.kind === 'folder' ? (e.open ? ' is-open' : '') : ' is-leaf')} aria-hidden>
                {e.kind === 'folder' && <Disclosure open={!!e.open} />}
              </span>
              <span className={'jz-epub-toc-link is-static' + (i === 3 ? ' is-active' : '')}>
                <span className="jz-epub-toc-text">{e.text}</span>
                {e.kind === 'folder' && prefs.counts ? <span className="jz-epub-toc-page">{e.count}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="jz-toc-admin-row">
      <div className="jz-toc-admin-row-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="jz-toc-admin-row-control">{children}</div>
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="jz-toc-admin-toggle">
      <span className="jz-toc-admin-toggle-text">
        <span>{label}</span>
        <small>{hint}</small>
      </span>
      <Switch checked={checked} onChange={onChange} />
    </label>
  );
}

export default function TocSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = !!user?.is_staff;
  const [saved, setSaved] = useState<TocPrefs | null>(null);
  const [draft, setDraft] = useState<TocPrefs>(DEFAULT_TOC_PREFS);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewTab, setPreviewTab] = useState<'article' | 'kb'>('article');

  useEffect(() => {
    getTocSettings()
      .then((res) => {
        setSaved(res.prefs);
        setDraft(res.prefs);
        setUpdatedAt(res.updated_at);
      })
      .catch((err) => {
        message.error(formatApiError(err, '加载目录设置失败'));
      });
  }, []);

  const dirty = !!saved && JSON.stringify(saved) !== JSON.stringify(draft);
  const isFactory = useMemo(() => JSON.stringify(draft) === JSON.stringify(DEFAULT_TOC_PREFS), [draft]);
  const patch = (p: Partial<TocPrefs>) => setDraft((d) => ({ ...d, ...p }));

  const apply = async (body: Partial<TocPrefs> | { reset: true }, ok: string, fail: string) => {
    setBusy(true);
    try {
      const res = await patchTocSettings(body);
      setSaved(res.prefs);
      setDraft(res.prefs);
      setUpdatedAt(res.updated_at);
      useTocSettingsStore.getState().setDefaults(res.prefs);
      message.success(ok);
    } catch (err) {
      message.error(formatApiError(err, fail));
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  return (
    <div className="jz-toc-admin">
      <AdminPageHeader
        title={
          <span className="jz-toc-admin-title">
            <span className="jz-toc-admin-title-icon jz-ico-toned jz-ico-tone-toc">
              <JzTocIcon size={22} />
            </span>
            目录设置
          </span>
        }
        backTo="/admin"
        backLabel="工作台"
        meta={
          <span className="jz-toc-admin-scope" aria-label="作用范围">
            <span className="jz-toc-admin-scope-label">作用于</span>
            <span className="jz-toc-admin-chip">文章页右侧目录</span>
            <span className="jz-toc-admin-chip">Word 导入文档</span>
            <span className="jz-toc-admin-chip">PDF 书签</span>
            <span className="jz-toc-admin-chip">知识库目录树</span>
          </span>
        }
        actions={
          <Space size={8}>
            {updatedAt && (
              <Text type="secondary" className="jz-toc-admin-stamp">
                上次保存 {new Date(updatedAt).toLocaleString()}
              </Text>
            )}
            <Tooltip title={isFactory ? '当前已是出厂默认' : '恢复出厂默认并保存'}>
              <Button icon={<ReloadOutlined />} onClick={() => apply({ reset: true }, '已恢复出厂默认', '恢复失败')} disabled={!canEdit || isFactory} loading={busy}>
                恢复出厂默认
              </Button>
            </Tooltip>
            <Button
              type="primary"
              icon={dirty ? <SaveOutlined /> : <CheckOutlined />}
              onClick={() => apply(draft, '目录默认设置已保存，全站生效', '保存失败')}
              disabled={!canEdit || !dirty}
              loading={busy}
            >
              {dirty ? '保存并全站生效' : '已是最新'}
            </Button>
          </Space>
        }
      />

      {!saved ? (
        <div className="jz-toc-admin-loading">
          <Spin />
        </div>
      ) : (
        <div className="jz-toc-admin-grid">
          <div className="jz-toc-admin-form">
            {/* ── 排版 ── */}
            <section className="jz-toc-admin-card">
              <header className="jz-toc-admin-card-head">
                <h3>排版</h3>
                <p>行距、字号与层级深度。读者可在目录齿轮里各自覆盖。</p>
              </header>
              <Row label="间距" hint="每行上下留白">
                <Segmented
                  block
                  value={draft.density}
                  onChange={(v) => patch({ density: v as TocPrefs['density'] })}
                  options={[
                    { label: '紧凑', value: 'compact' },
                    { label: '标准', value: 'normal' },
                    { label: '宽松', value: 'loose' },
                  ]}
                />
              </Row>
              <Row label="字号" hint="小 12 · 中 13 · 大 14">
                <Segmented
                  block
                  value={draft.size}
                  onChange={(v) => patch({ size: v as TocPrefs['size'] })}
                  options={[
                    { label: '小', value: 's' },
                    { label: '中', value: 'm' },
                    { label: '大', value: 'l' },
                  ]}
                />
              </Row>
              <Row label="字重" hint="层级靠字重区分；文楷只有 400 字重，粗会合成加粗">
                <Segmented
                  block
                  value={draft.weight}
                  onChange={(v) => patch({ weight: v as TocPrefs['weight'] })}
                  options={[
                    { label: <span style={{ fontWeight: 400 }}>细</span>, value: 'light' },
                    { label: <span style={{ fontWeight: 500 }}>标准</span>, value: 'normal' },
                    { label: <span style={{ fontWeight: 700 }}>粗</span>, value: 'bold' },
                  ]}
                />
              </Row>
              <Row label="层级深度" hint="文章目录展示到第几层标题">
                <Segmented
                  block
                  value={draft.depth}
                  onChange={(v) => patch({ depth: Number(v) as TocDepth })}
                  options={[
                    { label: '2 层', value: 2 },
                    { label: '3 层', value: 3 },
                    { label: '4 层', value: 4 },
                    { label: '全部', value: 6 },
                  ]}
                />
              </Row>
            </section>

            {/* ── 字体画廊 ── */}
            <section className="jz-toc-admin-card">
              <header className="jz-toc-admin-card-head">
                <h3>字体</h3>
                <p>九款自托管字体，每款以目录字样预览；「正文」跟随读者当前的正文字体。</p>
              </header>
              <div className="jz-toc-admin-fonts" role="radiogroup" aria-label="目录字体">
                {TOC_FONT_OPTIONS.map((o) => {
                  const on = draft.font === o.key;
                  return (
                    <button
                      type="button"
                      key={o.key}
                      role="radio"
                      aria-checked={on}
                      className={'jz-toc-admin-font' + (on ? ' is-on' : '')}
                      onClick={() => patch({ font: o.key })}
                      style={{ fontFamily: o.family }}
                    >
                      <span className="jz-toc-admin-font-specimen">1.2 知识库与博客的边界</span>
                      <span className="jz-toc-admin-font-name">
                        <b>{o.label}</b>
                        <small>{o.title}</small>
                      </span>
                      {on && <CheckOutlined className="jz-toc-admin-font-check" />}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── 颜色与显示 ── */}
            <section className="jz-toc-admin-card">
              <header className="jz-toc-admin-card-head">
                <h3>颜色与显示</h3>
                <p>层级如何着色，以及标题换行、章节编号、文件夹篇数。</p>
              </header>
              <Row label="颜色" hint="当前项始终为强调色">
                <Segmented
                  block
                  value={draft.color}
                  onChange={(v) => patch({ color: v as TocPrefs['color'] })}
                  options={[
                    { label: '正文色', value: 'text' },
                    { label: '淡显', value: 'muted' },
                    { label: '分层', value: 'layered' },
                  ]}
                />
              </Row>
              <div className="jz-toc-admin-toggles">
                <ToggleRow label="长标题换行" hint="关闭时单行省略，鼠标悬停看全文" checked={draft.wrap} onChange={(v) => patch({ wrap: v })} />
                <ToggleRow label="显示章节编号" hint="文章目录前缀 1 / 1.2 / 1.2.1" checked={draft.numbers} onChange={(v) => patch({ numbers: v })} />
                <ToggleRow label="显示篇数" hint="知识库目录树文件夹行右侧的文档数" checked={draft.counts} onChange={(v) => patch({ counts: v })} />
              </div>
            </section>

            <p className="jz-toc-admin-note">
              保存后立即成为全站默认。读者在目录齿轮里改过的项会保留他们自己的选择，直到点「跟随站点设置」；没动过的项自动跟随这里。
            </p>
          </div>

          <aside className="jz-toc-admin-preview">
            <div className="jz-toc-admin-preview-head">
              <span className="jz-toc-admin-preview-title">实时预览</span>
              <Segmented
                size="small"
                value={previewTab}
                onChange={(v) => setPreviewTab(v as 'article' | 'kb')}
                options={[
                  { label: '文章目录', value: 'article' },
                  { label: '知识库目录', value: 'kb' },
                ]}
              />
            </div>
            {previewTab === 'article' ? <ArticlePreview prefs={draft} /> : <KbPreview prefs={draft} />}
            <div className="jz-toc-admin-preview-foot">
              {dirty ? <span className="is-dirty">● 有未保存的改动</span> : <span>● 与线上一致</span>}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
