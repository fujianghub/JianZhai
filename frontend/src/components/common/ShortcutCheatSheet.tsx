import { useMemo, useState } from 'react';
import { Input, Modal, Segmented, Typography } from 'antd';
import Kbd from './Kbd';
import { inputRulesForScopes, shortcutsForScopes, type Scope, type ShortcutDef } from '@/shortcuts/registry';

const { Text } = Typography;

const SCOPE_LABEL: Partial<Record<Scope, string>> = {
  global: '全局',
  admin: '后台',
  blog: '博客',
  post: '阅读页',
  editor: '编辑器',
  'editor.rich': '富文本',
  'editor.markdown': 'Markdown',
  'editor.html': 'HTML',
  'code-block': '代码块',
  find: '查找替换',
  'reader.epub': 'EPUB 阅读器',
  'reader.pdf': 'PDF 阅读器',
  'reader.pptx': 'PPT 阅读器',
  lightbox: '全屏查看',
};

interface Props {
  open: boolean;
  onClose: () => void;
  scopes: readonly Scope[];
}

/**
 * 统一快捷键速查（2026-09-02）：按注册表 + 当前作用域生成，键帽平台化；
 * 此前 MD 编辑器一份硬编码 Modal、富文本一份藏在「更多」Popover 的表格，
 * 记法互不一致且都对 Mac 用户显示 Ctrl。
 */
export default function ShortcutCheatSheet({ open, onClose, scopes }: Props) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'keys' | 'rules'>('keys');
  const rules = useMemo(() => inputRulesForScopes(scopes), [scopes]);
  const groups = useMemo(() => {
    const list = shortcutsForScopes(scopes);
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? list.filter((s) => `${s.label} ${s.chord} ${s.when ?? ''} ${s.group}`.toLowerCase().includes(needle))
      : list;
    const byGroup = new Map<string, ShortcutDef[]>();
    for (const s of filtered) {
      const g = `${SCOPE_LABEL[s.scope] ?? s.scope} · ${s.group}`;
      byGroup.set(g, [...(byGroup.get(g) ?? []), s]);
    }
    return [...byGroup.entries()];
  }, [scopes, q]);

  const showRules = rules.length > 0;

  return (
    <Modal open={open} onCancel={onClose} footer={null} title="键盘快捷键" width={720} className="jz-cheatsheet">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <Input
          allowClear
          placeholder="筛选动作或键位…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1 }}
          autoFocus
        />
        {showRules && (
          <Segmented
            value={tab}
            onChange={(v) => setTab(v as 'keys' | 'rules')}
            options={[
              { value: 'keys', label: '快捷键' },
              { value: 'rules', label: '快捷输入' },
            ]}
          />
        )}
      </div>
      {tab === 'keys' ? (
        <div className="jz-cheatsheet-grid">
          {groups.length === 0 && <Text type="secondary">没有匹配的快捷键</Text>}
          {groups.map(([title, items]) => (
            <section key={title} className="jz-cheatsheet-group">
              <Text strong className="jz-cheatsheet-title">
                {title}
              </Text>
              {items.map((s) => (
                <div key={s.id} className="jz-cheatsheet-row">
                  <span className="jz-cheatsheet-label">
                    {s.label}
                    {s.when && <Text type="secondary"> · {s.when}</Text>}
                    {s.conflict && (
                      <Text type="warning" className="jz-cheatsheet-conflict">
                        {s.conflict}
                      </Text>
                    )}
                  </span>
                  <Kbd chord={s.chord} />
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="jz-cheatsheet-grid">
          {[...new Set(rules.map((r) => r.group))].map((g) => (
            <section key={g} className="jz-cheatsheet-group">
              <Text strong className="jz-cheatsheet-title">
                {g}
              </Text>
              {rules
                .filter((r) => r.group === g)
                .map((r) => (
                  <div key={r.trigger} className="jz-cheatsheet-row">
                    <span className="jz-cheatsheet-label">{r.label}</span>
                    <code className="jz-cheatsheet-trigger">{r.trigger}</code>
                  </div>
                ))}
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
