/**
 * Diff preview modal — shown before AI replaces user content.
 *
 * Without this, ``polish`` / ``fix`` silently overwrite the user's whole
 * selection (or whole document). With it, the user sees exactly which lines
 * changed and can confirm or cancel.
 *
 * Built on ``diff-match-patch`` (already in the project for version
 * history). We do a word-level diff for readability — character-level
 * generates too many tiny markers; line-level misses inline tweaks.
 */
import { useMemo } from 'react';
import { Button, Modal, Typography } from 'antd';
import DiffMatchPatch from 'diff-match-patch';

const { Text } = Typography;

export interface AIDiffPreviewProps {
  open: boolean;
  before: string;
  after: string;
  /** Title text — e.g. "润色结果对比". */
  title?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

interface Segment {
  type: -1 | 0 | 1; // -1 = removed, 0 = kept, 1 = added
  text: string;
}

function semanticDiff(before: string, after: string): Segment[] {
  const dmp = new DiffMatchPatch();
  // Char diff then cleanup semantically → reads like a real "edit"
  // rather than a noisy diff at every space.
  const raw = dmp.diff_main(before || '', after || '');
  dmp.diff_cleanupSemantic(raw);
  return raw.map(([type, text]) => ({ type: type as -1 | 0 | 1, text }));
}

export default function AIDiffPreview({
  open,
  before,
  after,
  title = 'AI 改写结果对比',
  onCancel,
  onConfirm,
}: AIDiffPreviewProps) {
  const segments = useMemo(() => semanticDiff(before, after), [before, after]);
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const s of segments) {
      if (s.type === 1) added += s.text.length;
      if (s.type === -1) removed += s.text.length;
    }
    return { added, removed };
  }, [segments]);

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onCancel}
      width={760}
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="ok" type="primary" onClick={onConfirm}>确认替换</Button>,
      ]}
      destroyOnClose
    >
      <div className="jz-ai-diff-summary">
        <Text type="secondary" style={{ fontSize: 12 }}>
          共改动：<span style={{ color: '#10b981' }}>+{stats.added}</span>{' '}
          <span style={{ color: '#ef4444' }}>−{stats.removed}</span> 字符
        </Text>
      </div>
      <div className="jz-ai-diff-body" role="region" aria-label="差异视图">
        {segments.map((s, i) => {
          if (s.type === 0) {
            return (
              <span key={i} className="jz-ai-diff-kept">
                {s.text}
              </span>
            );
          }
          if (s.type === 1) {
            return (
              <ins key={i} className="jz-ai-diff-added">
                {s.text}
              </ins>
            );
          }
          return (
            <del key={i} className="jz-ai-diff-removed">
              {s.text}
            </del>
          );
        })}
      </div>
    </Modal>
  );
}
