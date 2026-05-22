import { useEffect, useState } from 'react';
import { Avatar, Spin, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { getDocumentStats, type DocumentStats } from '@/api/docs';

interface Props {
  documentId: number;
}

/**
 * 文档统计 / 贡献者面板 — 渲染在「⋯」下拉底部。
 * 字数 / 创建 / 最后编辑 / 贡献者头像。
 */
export function DocStatsPanel({ documentId }: Props) {
  const [data, setData] = useState<DocumentStats | null>(null);
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setErr('');
    getDocumentStats(documentId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : '加载失败'));
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (err) {
    return <div className="jz-stats-error">{err}</div>;
  }
  if (!data) {
    return (
      <div className="jz-stats-loading">
        <Spin size="small" />
      </div>
    );
  }

  function user(u: DocumentStats['created_by']) {
    return u ? u.username : '—';
  }

  return (
    <div className="jz-doc-stats">
      <div className="jz-stats-title">统计信息</div>

      <div className="jz-stats-grid">
        <div className="jz-stats-row">
          <span className="jz-stats-key">字数</span>
          <span className="jz-stats-val jz-stats-num">{data.word_count.toLocaleString()}</span>
        </div>
        <div className="jz-stats-row">
          <span className="jz-stats-key">版本快照</span>
          <span className="jz-stats-val jz-stats-num">{data.version_count.toLocaleString()}</span>
        </div>
        <div className="jz-stats-row">
          <span className="jz-stats-key">创建</span>
          <span className="jz-stats-val">
            {data.created_at ? dayjs(data.created_at).format('YYYY-MM-DD HH:mm') : '—'}
            <span className="jz-stats-by">·&nbsp;{user(data.created_by)}</span>
          </span>
        </div>
        <div className="jz-stats-row">
          <span className="jz-stats-key">最后编辑</span>
          <span className="jz-stats-val">
            {data.updated_at ? dayjs(data.updated_at).format('YYYY-MM-DD HH:mm') : '—'}
            <span className="jz-stats-by">·&nbsp;{user(data.last_edited_by)}</span>
          </span>
        </div>
        {data.published_at && (
          <div className="jz-stats-row">
            <span className="jz-stats-key">最近发布</span>
            <span className="jz-stats-val">{dayjs(data.published_at).format('YYYY-MM-DD HH:mm')}</span>
          </div>
        )}
      </div>

      {data.contributors.length > 0 && (
        <div className="jz-stats-contributors">
          <div className="jz-stats-key" style={{ marginBottom: 6 }}>
            贡献者 ({data.contributors.length})
          </div>
          <Avatar.Group max={{ count: 8 }} size="small">
            {data.contributors.map((u) => (
              <Tooltip key={u.id} title={u.username + (u.is_staff ? ' (管理员)' : '')}>
                <Avatar
                  size="small"
                  style={{
                    background: u.is_staff
                      ? 'var(--jz-accent)'
                      : 'color-mix(in srgb, var(--jz-accent) 30%, var(--jz-surface-2))',
                    color: u.is_staff ? '#faf3e0' : 'var(--jz-text)',
                    fontWeight: 600,
                    fontSize: 11,
                  }}
                >
                  {u.username.slice(0, 1).toUpperCase()}
                </Avatar>
              </Tooltip>
            ))}
          </Avatar.Group>
        </div>
      )}
    </div>
  );
}
