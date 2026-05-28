import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { quickCapture } from '@/api/docs';
import { listKBs } from '@/api/kbs';
import { formatApiError } from '@/api/client';
import { message } from '@/utils/notify';
import type { KnowledgeBase } from '@/types';

const { Text } = Typography;
const INBOX_KB_KEY = 'jz-inbox-kb';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Friction-free "速记" modal triggered by Cmd/Ctrl+Shift+N from AdminLayout.
 *  Enter submits, Shift+Enter inserts a newline, Esc closes. KB choice is
 *  remembered in localStorage so subsequent captures land in one keystroke. */
export default function QuickCaptureModal({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [kbs, setKbs] = useState<KnowledgeBase[] | null>(null);
  const [kbId, setKbId] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(INBOX_KB_KEY);
      return v ? Number(v) || null : null;
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);

  // Lazy-load KBs only when the modal opens.
  useEffect(() => {
    if (!open || kbs !== null) return;
    let cancelled = false;
    listKBs()
      .then((list) => !cancelled && setKbs(list))
      .catch(() => !cancelled && setKbs([]));
    return () => { cancelled = true; };
  }, [open, kbs]);

  useEffect(() => {
    if (!open) {
      setText('');
      setBusy(false);
    }
  }, [open]);

  // If the stored KB no longer exists (deleted), forget it.
  useEffect(() => {
    if (kbs === null || !kbId) return;
    if (!kbs.some((k) => k.id === kbId)) {
      setKbId(null);
      try { localStorage.removeItem(INBOX_KB_KEY); } catch { /* ignore */ }
    }
  }, [kbs, kbId]);

  const effectiveKbId = useMemo(() => {
    if (kbId) return kbId;
    return kbs && kbs.length > 0 ? kbs[0].id : null;
  }, [kbId, kbs]);

  const submit = useCallback(async (jumpToDoc: boolean) => {
    if (!effectiveKbId) {
      message.warning('请先选择一个收件箱知识库');
      return;
    }
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const r = await quickCapture(effectiveKbId, body);
      try { localStorage.setItem(INBOX_KB_KEY, String(effectiveKbId)); } catch { /* ignore */ }
      message.success(`已记到「${r.title}」`);
      setText('');
      onClose();
      if (jumpToDoc) {
        navigate(`/admin/kbs/${r.knowledge_base}/docs/${r.id}`);
      }
    } catch (e) {
      message.error(formatApiError(e, '速记失败'));
    } finally {
      setBusy(false);
    }
  }, [effectiveKbId, text, onClose, navigate]);

  const inboxKb = kbs?.find((k) => k.id === effectiveKbId);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={560}
      styles={{ body: { padding: 18 } }}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          速记
          {inboxKb && <Tag color="green" style={{ marginRight: 0 }}>→ {inboxKb.name}</Tag>}
        </span>
      }
    >
      <Input.TextArea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoSize={{ minRows: 3, maxRows: 10 }}
        placeholder="想到什么就写——第一行会成为文档标题。Enter 保存,Shift+Enter 换行,Esc 关闭。"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit(false);
          }
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>收件箱</Text>
        <Select
          size="small"
          value={effectiveKbId ?? undefined}
          onChange={(v) => setKbId(v)}
          options={(kbs ?? []).map((kb) => ({ value: kb.id, label: kb.name }))}
          placeholder="选择 KB"
          style={{ flex: '1 1 140px', minWidth: 140 }}
          loading={kbs === null}
        />
        <div style={{ flexGrow: 1 }} />
        <Button
          type="link"
          onClick={() => void submit(true)}
          disabled={busy || !text.trim()}
          style={{ padding: 0 }}
        >
          保存并打开
        </Button>
        <Button
          type="primary"
          loading={busy}
          disabled={!text.trim()}
          onClick={() => void submit(false)}
        >
          保存
        </Button>
      </div>
    </Modal>
  );
}
