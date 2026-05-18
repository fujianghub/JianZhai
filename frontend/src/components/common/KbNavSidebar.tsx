import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Empty, Spin, Tooltip, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import * as kbsApi from '@/api/kbs';
import type { PublicKBTree } from '@/types';
import PublicKbFolderTree from './PublicKbFolderTree';

const { Text } = Typography;

interface Props {
  kbSlug: string;
  /** Slug of the currently-open post; highlighted in the list. */
  currentSlug?: string;
  /** Optional collapse handler; when provided, a close button is shown. */
  onClose?: () => void;
}

/**
 * Left-rail document list for the current knowledge base. Lets the reader
 * switch between posts without going back to the KB landing page.
 */
export default function KbNavSidebar({ kbSlug, currentSlug, onClose }: Props) {
  const [tree, setTree] = useState<PublicKBTree | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTree(null);
    kbsApi
      .getPublicKBTree(kbSlug)
      .then((t) => {
        if (!cancelled) setTree(t);
      })
      .catch(() => {
        if (!cancelled) setTree(null);
      });
    return () => {
      cancelled = true;
    };
  }, [kbSlug]);

  if (!tree) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <Spin size="small" />
      </div>
    );
  }

  return (
    <nav className="jz-kb-nav" aria-label="知识库文档列表">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4, marginBottom: 8 }}>
        <Link
          to={`/kb/${encodeURIComponent(tree.slug)}`}
          style={{ color: 'inherit', textDecoration: 'none', flex: 1, minWidth: 0 }}
        >
          <Text type="secondary" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
            知识库
          </Text>
          <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.4, marginTop: 2 }}>
            {tree.name}
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {tree.documents.length} 篇文档
          </Text>
        </Link>
        {onClose && (
          <Tooltip title="隐藏文档列表">
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={onClose}
              aria-label="隐藏文档列表"
            />
          </Tooltip>
        )}
      </div>

      {tree.documents.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无文档" style={{ margin: '12px 0' }} />
      ) : (
        <PublicKbFolderTree
          folders={tree.folders ?? []}
          rootDocuments={tree.root_documents ?? tree.documents}
          currentSlug={currentSlug}
          density="sidebar"
        />
      )}
    </nav>
  );
}
