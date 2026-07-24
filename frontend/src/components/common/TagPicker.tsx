import { useEffect, useState } from 'react';
import { Popover, Select, Tag as AntTag, Tooltip, message } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import * as tagsApi from '@/api/tags';
import type { Tag } from '@/api/tags';
import * as kbsApi from '@/api/kbs';
import { formatApiError } from '@/api/client';
import { resolveTagColor } from '@/utils/tagColor';

interface Props {
  /** Target — either a document or a knowledge base. */
  target: { kind: 'document'; id: number } | { kind: 'kb'; id: number };
}

const PRESET_COLORS = [
  '', // theme default
  '#10b981',
  '#52c41a',
  '#fa8c16',
  '#722ed1',
  '#eb2f96',
  '#13c2c2',
  '#fadb14',
  '#f5222d',
  '#8c8c8c',
];

const ID_PREFIX = 'id:';
const toKey = (id: number) => `${ID_PREFIX}${id}`;
const fromKey = (v: string): number | null =>
  v.startsWith(ID_PREFIX) ? Number(v.slice(ID_PREFIX.length)) : null;

export default function TagPicker({ target }: Props) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [mine, setMine] = useState<Tag[]>([]);

  async function reloadAll() {
    setAllTags(await tagsApi.listTags());
  }

  async function reloadMine() {
    const list =
      target.kind === 'document'
        ? await tagsApi.getDocumentTags(target.id)
        : await kbsApi.getKBTags(target.id);
    setMine(list);
  }

  useEffect(() => {
    void Promise.all([reloadAll(), reloadMine()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.kind, target.id]);

  async function handleChange(values: string[]) {
    const existingByName = new Map(allTags.map((t) => [t.name, t]));
    const tagIds: number[] = [];
    let local = allTags;
    for (const v of values) {
      const knownId = fromKey(v);
      if (knownId !== null) {
        tagIds.push(knownId);
        continue;
      }
      const trimmed = v.trim();
      if (!trimmed) continue;
      const existing = existingByName.get(trimmed);
      if (existing) {
        tagIds.push(existing.id);
      } else {
        try {
          const created = await tagsApi.createTag(trimmed);
          local = [...local, created];
          tagIds.push(created.id);
        } catch (err) {
          message.error(formatApiError(err, '创建标签失败'));
        }
      }
    }
    try {
      const next =
        target.kind === 'document'
          ? await tagsApi.setDocumentTags(target.id, tagIds)
          : await kbsApi.setKBTags(target.id, tagIds);
      setMine(next);
      setAllTags(local);
    } catch (err) {
      message.error(formatApiError(err, '保存标签失败'));
    }
  }

  async function recolor(tag: Tag, color: string) {
    try {
      const updated = await tagsApi.updateTag(tag.id, { color });
      setAllTags((prev) => prev.map((t) => (t.id === tag.id ? updated : t)));
      setMine((prev) => prev.map((t) => (t.id === tag.id ? updated : t)));
    } catch (err) {
      message.error(formatApiError(err, '修改颜色失败'));
    }
  }

  function renderColorPalette(tag: Tag) {
    return (
      <div style={{ width: 200 }}>
        <div style={{ color: 'var(--jz-text-muted)', fontSize: 12, marginBottom: 8 }}>
          标签颜色：{tag.name}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c || 'default'}
              type="button"
              onClick={() => void recolor(tag, c)}
              aria-label={c || '默认'}
              title={c || '默认'}
              style={{
                width: 22,
                height: 22,
                border:
                  (tag.color || '') === c ? '2px solid var(--jz-accent)' : '1px solid var(--jz-border, #ddd)',
                background: c || 'linear-gradient(135deg,#eee,#bbb)',
                borderRadius: '50%',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>
        <input
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(tag.color) ? tag.color : '#10b981'}
          onChange={(e) => void recolor(tag, e.target.value)}
          style={{ width: '100%', height: 28, border: 'none', background: 'transparent' }}
        />
      </div>
    );
  }

  return (
    <Tooltip title="标签（回车新建；点调色盘图标改色）">
      <Select
        mode="tags"
        size="small"
        style={{ minWidth: 240 }}
        value={mine.map((t) => toKey(t.id))}
        onChange={handleChange}
        placeholder="标签"
        tagRender={({ value, closable, onClose }) => {
          const id = typeof value === 'string' ? fromKey(value) : null;
          const tag =
            id !== null ? allTags.find((t) => t.id === id) ?? mine.find((t) => t.id === id) : undefined;
          if (!tag)
            return (
              <AntTag closable={closable} onClose={onClose}>
                {String(value)}
              </AntTag>
            );
          return (
            <AntTag color={resolveTagColor(tag)} closable={closable} onClose={onClose}>
              <span style={{ marginRight: 4 }}>{tag.name}</span>
              <Popover content={renderColorPalette(tag)} trigger="click" placement="bottomLeft">
                <span
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{ cursor: 'pointer', opacity: 0.7 }}
                >
                  <BgColorsOutlined />
                </span>
              </Popover>
            </AntTag>
          );
        }}
        options={allTags.map((t) => ({ value: toKey(t.id), label: t.name }))}
      />
    </Tooltip>
  );
}
