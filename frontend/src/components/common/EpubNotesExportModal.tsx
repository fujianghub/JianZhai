/**
 * "导出笔记": preview of the generated Markdown, copy / download for everyone,
 * "存为文档" (creates a Markdown document in a chosen KB) for authors.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select, Space, Typography } from 'antd';
import { message } from '@/utils/notify';
import { CopyOutlined, DownloadOutlined, FileAddOutlined } from '@ant-design/icons';
import { listKBs } from '@/api/kbs';
import { createDocument } from '@/api/docs';
import type { KnowledgeBase } from '@/types';

const { Text } = Typography;
const KB_KEY = 'jz-epub-notes-kb';

interface Props {
  open: boolean;
  onClose: () => void;
  markdown: string;
  filename: string;
  title: string;
  canCreateDoc: boolean;
  popupContainer?: () => HTMLElement;
}

export function downloadTextFile(name: string, text: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function EpubNotesExportModal({ open, onClose, markdown, filename, title, canCreateDoc, popupContainer }: Props) {
  const [kbs, setKbs] = useState<KnowledgeBase[] | null>(null);
  const [kbId, setKbId] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(KB_KEY);
      return v ? Number(v) || null : null;
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: number; kb: number } | null>(null);

  useEffect(() => {
    if (!open || !canCreateDoc || kbs !== null) return;
    let cancelled = false;
    listKBs()
      .then((list) => !cancelled && setKbs(list))
      .catch(() => !cancelled && setKbs([]));
    return () => {
      cancelled = true;
    };
  }, [open, canCreateDoc, kbs]);

  useEffect(() => {
    if (!open) setCreated(null);
  }, [open]);

  const effectiveKb = useMemo(() => {
    if (kbId && kbs?.some((k) => k.id === kbId)) return kbId;
    return kbs && kbs.length > 0 ? kbs[0].id : null;
  }, [kbId, kbs]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      message.success('已复制 Markdown');
    } catch {
      message.error('复制失败，请手动选择文本复制');
    }
  };

  const saveAsDoc = async () => {
    if (!effectiveKb) {
      message.warning('请先选择知识库');
      return;
    }
    setBusy(true);
    try {
      const doc = await createDocument({ knowledge_base: effectiveKb, title: `《${title}》读书笔记`, raw_content: markdown });
      try {
        localStorage.setItem(KB_KEY, String(effectiveKb));
      } catch {
        /* ignore */
      }
      setCreated({ id: doc.id, kb: effectiveKb });
      message.success('已创建笔记文档');
    } catch {
      message.error('创建文档失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="导出读书笔记"
      footer={null}
      width="min(92vw, 720px)"
      getContainer={popupContainer}
      destroyOnHidden
      className="jz-epub-notes-export"
    >
      <Input.TextArea value={markdown} readOnly autoSize={{ minRows: 10, maxRows: 22 }} style={{ fontFamily: 'var(--jz-font-mono)', fontSize: 'var(--jz-fs-sm)' }} />
      <div className="jz-epub-notes-export-foot">
        <Space wrap>
          <Button icon={<CopyOutlined />} onClick={() => void copy()}>
            复制
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => downloadTextFile(filename, markdown)}>
            下载 .md
          </Button>
        </Space>
        {canCreateDoc && (
          <Space wrap>
            <Select
              size="middle"
              style={{ minWidth: 180 }}
              placeholder="存入知识库…"
              loading={kbs === null}
              value={effectiveKb ?? undefined}
              onChange={(v) => setKbId(v)}
              options={(kbs ?? []).map((k) => ({ value: k.id, label: k.name }))}
              getPopupContainer={popupContainer}
            />
            {created ? (
              <Button type="link" href={`/admin/kbs/${created.kb}?doc=${created.id}`} target="_blank" rel="noreferrer">
                打开笔记文档
              </Button>
            ) : (
              <Button type="primary" icon={<FileAddOutlined />} loading={busy} onClick={() => void saveAsDoc()} disabled={!effectiveKb}>
                存为文档
              </Button>
            )}
          </Space>
        )}
      </div>
      {!canCreateDoc && (
        <Text type="secondary" style={{ fontSize: 'var(--jz-fs-xs)', display: 'block', marginTop: 8 }}>
          笔记只有你自己可见；下载后可导入 Obsidian / Typora 等工具。
        </Text>
      )}
    </Modal>
  );
}
