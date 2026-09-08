/**
 * /admin/toc — 目录设置（站点级默认，按类型集中管理）。
 *
 * Three TOC surfaces, each with its own defaults (``TOC_SCOPES`` /
 * ``TOC_SCOPE_META``): 大类知识库目录 (``kblist``, the blog rail's KB list) ·
 * 知识库文档目录 (``kb``, a KB's folder/document tree) · 文档内容目录
 * (``article``, an article's heading outline). A tab strip picks the scope;
 * the form below shows only the knobs that scope exposes (排版 / 字体画廊 /
 * 颜色与显示) and the right column previews that surface live. Saving sends
 * every dirty scope in one PATCH; readers keep any key they overrode locally.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, Segmented, Space, Spin, Switch, Tooltip, Typography } from 'antd';
import { CheckOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import Chevron from '../../components/common/Chevron';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { JzTocIcon } from '@/components/common/JzIconKit';
import Disclosure from '@/components/common/Disclosure';
import { formatApiError } from '@/api/client';
import { getTocSettings, patchTocSettings, type TocSettingsPatch } from '@/api/tocSettings';
import { useAuthStore } from '@/stores/auth';
import { useTocSettingsStore } from '@/stores/tocSettings';
import { message } from '@/utils/notify';
import {
  DEFAULT_TOC_PREFS,
  DEFAULT_TOC_SITE,
  TOC_FONT_OPTIONS,
  TOC_SCOPES,
  TOC_SCOPE_META,
  relativeTocLevel,
  tocFontFamily,
  type TocDepth,
  type TocPrefs,
  type TocScope,
  type TocSiteDefaults,
} from '@/utils/tocPrefs';

const { Text } = Typography;

const SCOPE_INDEX: Record<TocScope, string> = { kblist: '一', kb: '二', article: '三' };

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

const KB_LIST_SAMPLE: { category: string | null; accent?: string; kbs: { name: string; count: number; active?: boolean }[] }[] = [
  {
    category: '网络',
    accent: '#3b7dd8',
    kbs: [
      { name: '数据中心网络', count: 12 },
      { name: 'RDMA 与无损网络：一个足够长的知识库名用来看换行与省略', count: 7, active: true },
      { name: 'SDN 与自动化', count: 5 },
    ],
  },
  { category: '系统', accent: '#b8862b', kbs: [{ name: 'Linux 内核', count: 9 }, { name: '存储', count: 4 }] },
  { category: null, kbs: [{ name: '读书笔记', count: 3 }] },
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
      <nav className="jz-epub-toc jz-article-toc jz-toc-preview" aria-label="文章目录预览" {...navProps(prefs)}>
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
      <nav className="jz-epub-toc jz-kb-toc jz-toc-preview" aria-label="知识库文档目录预览" {...navProps(prefs)}>
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

/** Mirrors ``BlogKbNavPanel``'s 知识库 section markup (same data-* + CSS). */
function KbListPreview({ prefs }: { prefs: TocPrefs }) {
  const groups = prefs.grouped ? KB_LIST_SAMPLE : [{ category: null, kbs: KB_LIST_SAMPLE.flatMap((g) => g.kbs) }];
  return (
    <div className="jz-toc-preview-rail">
      <div className="jz-toc-preview-tabs" aria-hidden>
        <span className="is-on">知识库</span>
        <span>目录</span>
      </div>
      <section className="jz-kb-nav jz-kb-nav-kbs jz-toc-preview" aria-label="知识库列表预览" {...navProps(prefs)} data-counts={prefs.counts ? 'on' : 'off'}>
        <ul className="jz-kb-nav-kb-list">
          {groups.map((g, gi) => (
            <li key={gi}>
              {prefs.grouped && (
                <div className="jz-kb-nav-cat" style={g.accent ? ({ ['--jz-cat-accent' as string]: g.accent } as React.CSSProperties) : undefined}>
                  <i aria-hidden />
                  {g.category ?? '未分类'}
                </div>
              )}
              <ul className="jz-kb-nav-kb-list jz-kb-nav-kb-group">
                {g.kbs.map((kb) => (
                  <li key={kb.name}>
                    <span className={'jz-kb-nav-kb-item' + (kb.active ? ' is-active' : '')} aria-current={kb.active ? 'page' : undefined}>
                      <span className="jz-kb-nav-kb-item-name">{kb.name}</span>
                      <span className="jz-kb-nav-kb-item-count">{kb.count}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
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

const same = (a: TocPrefs, b: TocPrefs) => JSON.stringify(a) === JSON.stringify(b);

export default function TocSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const canEdit = !!user?.is_staff;
  const [saved, setSaved] = useState<TocSiteDefaults | null>(null);
  const [draft, setDraft] = useState<TocSiteDefaults>(DEFAULT_TOC_SITE);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<TocScope>('kblist');

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

  const meta = TOC_SCOPE_META[scope];
  const features = meta.features;
  const cur = draft[scope];
  const dirtyScopes = useMemo(() => (saved ? TOC_SCOPES.filter((s) => !same(saved[s], draft[s])) : []), [saved, draft]);
  const dirty = dirtyScopes.length > 0;
  const scopeDirty = dirtyScopes.includes(scope);
  // 恢复出厂 resets the SERVER value (and the draft), so it stays enabled while
  // either side differs from factory — a draft copied back to factory values
  // must not hide the way to reset what is actually saved.
  const isFactory = (s: TocScope) => same(draft[s], DEFAULT_TOC_PREFS) && (!saved || same(saved[s], DEFAULT_TOC_PREFS));
  const scopeIsFactory = isFactory(scope);
  const allFactory = TOC_SCOPES.every(isFactory);
  const patch = (p: Partial<TocPrefs>) => setDraft((d) => ({ ...d, [scope]: { ...d[scope], ...p } }));
  /** Copy the active scope's draft onto the other two (draft only — save to apply). */
  const spread = () =>
    setDraft((d) => {
      const next = { ...d };
      for (const s of TOC_SCOPES) if (s !== scope) next[s] = { ...d[scope] };
      return next;
    });

  const apply = async (body: TocSettingsPatch, ok: string, fail: string) => {
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
  const save = () => {
    const body: TocSettingsPatch = {};
    for (const s of dirtyScopes) body[s] = draft[s];
    void apply(body, `已保存 ${dirtyScopes.map((s) => TOC_SCOPE_META[s].label).join('、')}，全站生效`, '保存失败');
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
            <span className="jz-toc-admin-scope-label">{meta.label} · 作用于</span>
            {meta.chips.map((c) => (
              <span key={c} className="jz-toc-admin-chip">
                {c}
              </span>
            ))}
          </span>
        }
        actions={
          <Space size={8}>
            {updatedAt && (
              <Text type="secondary" className="jz-toc-admin-stamp">
                上次保存 {new Date(updatedAt).toLocaleString()}
              </Text>
            )}
            <Dropdown
              disabled={!canEdit || busy}
              menu={{
                items: [
                  {
                    key: 'scope',
                    label: `仅恢复「${meta.label}」`,
                    disabled: scopeIsFactory,
                    onClick: () => apply({ reset: scope }, `${meta.label}已恢复出厂默认`, '恢复失败'),
                  },
                  {
                    key: 'all',
                    label: '恢复全部三类',
                    disabled: allFactory,
                    onClick: () => apply({ reset: true }, '三类目录均已恢复出厂默认', '恢复失败'),
                  },
                ],
              }}
            >
              <Button icon={<ReloadOutlined />} disabled={!canEdit || allFactory} loading={busy}>
                恢复出厂默认 <Chevron direction="down" size={12} className="jz-btn-caret" />
              </Button>
            </Dropdown>
            <Button type="primary" icon={dirty ? <SaveOutlined /> : <CheckOutlined />} onClick={save} disabled={!canEdit || !dirty} loading={busy}>
              {dirty ? `保存并全站生效（${dirtyScopes.length} 类）` : '已是最新'}
            </Button>
          </Space>
        }
      />

      {!saved ? (
        <div className="jz-toc-admin-loading">
          <Spin />
        </div>
      ) : (
        <>
          {/* ── 类型切换 ── */}
          <div className="jz-toc-admin-scopes" role="tablist" aria-label="目录类型">
            {TOC_SCOPES.map((s) => {
              const m = TOC_SCOPE_META[s];
              const on = s === scope;
              const d = dirtyScopes.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-scope={s}
                  className={'jz-toc-admin-scope-tab' + (on ? ' is-on' : '') + (d ? ' is-dirty' : '')}
                  onClick={() => setScope(s)}
                >
                  <span className="jz-toc-admin-scope-idx" aria-hidden>
                    {SCOPE_INDEX[s]}
                  </span>
                  <span className="jz-toc-admin-scope-text">
                    <b>{m.label}</b>
                    <small>{m.hint}</small>
                  </span>
                  <span className="jz-toc-admin-scope-state" aria-label={d ? '有未保存改动' : same(draft[s], DEFAULT_TOC_PREFS) ? '出厂默认' : '已自定义'}>
                    {d ? '● 未保存' : same(draft[s], DEFAULT_TOC_PREFS) ? '出厂' : '自定义'}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="jz-toc-admin-grid">
            <div className="jz-toc-admin-form">
              {/* ── 排版 ── */}
              <section className="jz-toc-admin-card">
                <header className="jz-toc-admin-card-head">
                  <h3>排版</h3>
                  <p>{features.depth ? '行距、字号、字重与层级深度。' : '行距、字号与字重。'}读者可在目录齿轮里各自覆盖。</p>
                  <Tooltip title="把当前这一类的全部设置复制到另外两类（仍需保存）">
                    <Button size="small" type="link" onClick={spread} className="jz-toc-admin-spread">
                      套用到其余两类
                    </Button>
                  </Tooltip>
                </header>
                <Row label="间距" hint="每行上下留白">
                  <Segmented
                    block
                    value={cur.density}
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
                    value={cur.size}
                    onChange={(v) => patch({ size: v as TocPrefs['size'] })}
                    options={[
                      { label: '小', value: 's' },
                      { label: '中', value: 'm' },
                      { label: '大', value: 'l' },
                    ]}
                  />
                </Row>
                <Row label="字重" hint={features.depth || scope === 'kb' ? '层级靠字重区分；文楷只有 400 字重，粗会合成加粗' : '库名字重；当前库再加一档'}>
                  <Segmented
                    block
                    value={cur.weight}
                    onChange={(v) => patch({ weight: v as TocPrefs['weight'] })}
                    options={[
                      { label: <span style={{ fontWeight: 400 }}>细</span>, value: 'light' },
                      { label: <span style={{ fontWeight: 500 }}>标准</span>, value: 'normal' },
                      { label: <span style={{ fontWeight: 700 }}>粗</span>, value: 'bold' },
                    ]}
                  />
                </Row>
                {features.depth && (
                  <Row label="层级深度" hint="文章目录展示到第几层标题">
                    <Segmented
                      block
                      value={cur.depth}
                      onChange={(v) => patch({ depth: Number(v) as TocDepth })}
                      options={[
                        { label: '2 层', value: 2 },
                        { label: '3 层', value: 3 },
                        { label: '4 层', value: 4 },
                        { label: '全部', value: 6 },
                      ]}
                    />
                  </Row>
                )}
              </section>

              {/* ── 字体画廊 ── */}
              <section className="jz-toc-admin-card">
                <header className="jz-toc-admin-card-head">
                  <h3>字体</h3>
                  <p>九款自托管字体，每款以目录字样预览；「正文」跟随读者当前的正文字体。</p>
                </header>
                <div className="jz-toc-admin-fonts" role="radiogroup" aria-label="目录字体">
                  {TOC_FONT_OPTIONS.map((o) => {
                    const on = cur.font === o.key;
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
                        <span className="jz-toc-admin-font-specimen">{scope === 'kblist' ? '数据中心网络 · 12' : '1.2 知识库与博客的边界'}</span>
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
                  <p>
                    {scope === 'kblist' && '库名如何着色，以及长库名换行、按大类分组、显示篇数。'}
                    {scope === 'kb' && '层级如何着色，以及标题换行、文件夹篇数。'}
                    {scope === 'article' && '层级如何着色，以及标题换行、章节编号。'}
                  </p>
                </header>
                <Row label="颜色" hint={scope === 'kblist' ? '当前库始终为强调色' : '当前项始终为强调色'}>
                  <Segmented
                    block
                    value={cur.color === 'layered' && !features.colorLayered ? 'text' : cur.color}
                    onChange={(v) => patch({ color: v as TocPrefs['color'] })}
                    options={[
                      { label: '正文色', value: 'text' },
                      { label: '淡显', value: 'muted' },
                      ...(features.colorLayered ? [{ label: '分层', value: 'layered' }] : []),
                    ]}
                  />
                </Row>
                <div className="jz-toc-admin-toggles">
                  <ToggleRow
                    label={scope === 'kblist' ? '长库名换行' : '长标题换行'}
                    hint="关闭时单行省略，鼠标悬停看全文"
                    checked={cur.wrap}
                    onChange={(v) => patch({ wrap: v })}
                  />
                  {features.numbers && (
                    <ToggleRow label="显示章节编号" hint="文章目录前缀 1 / 1.2 / 1.2.1" checked={cur.numbers} onChange={(v) => patch({ numbers: v })} />
                  )}
                  {features.grouped && (
                    <ToggleRow label="按大类分组" hint="关闭时为一份按名称排序的平铺列表" checked={cur.grouped} onChange={(v) => patch({ grouped: v })} />
                  )}
                  {features.counts && (
                    <ToggleRow
                      label="显示篇数"
                      hint={scope === 'kblist' ? '每个知识库右侧的文档数' : '知识库目录树文件夹行右侧的文档数'}
                      checked={cur.counts}
                      onChange={(v) => patch({ counts: v })}
                    />
                  )}
                </div>
              </section>

              <p className="jz-toc-admin-note">
                三类目录各自独立保存，保存后立即成为全站默认。读者在对应目录齿轮里改过的项会保留他们自己的选择，直到点「跟随站点设置」；没动过的项自动跟随这里。
              </p>
            </div>

            <aside className="jz-toc-admin-preview">
              <div className="jz-toc-admin-preview-head">
                <span className="jz-toc-admin-preview-title">实时预览</span>
                <span className="jz-toc-admin-chip">{meta.short}</span>
              </div>
              {scope === 'article' && <ArticlePreview prefs={cur} />}
              {scope === 'kb' && <KbPreview prefs={cur} />}
              {scope === 'kblist' && <KbListPreview prefs={cur} />}
              <div className="jz-toc-admin-preview-foot">
                {scopeDirty ? <span className="is-dirty">● 本类有未保存的改动</span> : <span>● 本类与线上一致</span>}
                {dirty && !scopeDirty && <span className="is-dirty"> · 其它类型有改动待保存</span>}
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
