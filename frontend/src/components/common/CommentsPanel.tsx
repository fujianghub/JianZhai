import { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Input, List, Popconfirm, Space, Spin, Tag, Typography } from 'antd';
import { message } from '@/utils/notify';
import { DeleteOutlined, MessageOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import * as commentsApi from '@/api/comments';
import type { Comment } from '@/api/comments';
import { renderMarkdown } from '@/utils/markdown';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Props {
  documentId: number;
  /** When true, hides the section header and removes the top border / margin (used inside the tabbed sidebar). */
  compact?: boolean;
}

export default function CommentsPanel({ documentId, compact = false }: Props) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setComments(await commentsApi.listComments(documentId));
  }, [documentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSubmit() {
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      await commentsApi.createComment(documentId, draft.trim());
      setDraft('');
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    await commentsApi.deleteComment(id);
    message.success('已删除');
    await refresh();
  }

  return (
    <div style={compact ? { padding: '8px 0' } : { borderTop: '1px solid #f0f0f0', paddingTop: 16, marginTop: 24 }}>
      {!compact && (
        <Title level={5} style={{ marginBottom: 8 }}>
          <MessageOutlined /> 笔记批注{' '}
          <Text type="secondary">({comments?.length ?? 0})</Text>
        </Title>
      )}
      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <TextArea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="写一条文档级评论...（支持 Markdown）"
          autoSize={{ minRows: 2, maxRows: 6 }}
        />
        <Button type="primary" loading={submitting} onClick={handleSubmit}>
          发布
        </Button>
      </Space.Compact>

      {comments === null ? (
        <Spin />
      ) : comments.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有评论" />
      ) : (
        <List
          dataSource={comments}
          renderItem={(c) => (
            <List.Item
              actions={[
                <Popconfirm key="del" title="删除该评论？" onConfirm={() => handleDelete(c.id)}>
                  <Button size="small" type="text" icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <div style={{ width: '100%' }}>
                <Space style={{ marginBottom: 4 }} size={6}>
                  {c.block_id && <Tag color="blue">块 {c.block_id}</Tag>}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(c.created_at).format('YYYY-MM-DD HH:mm')}
                  </Text>
                </Space>
                <div
                  className="markdown-preview"
                  style={{ fontSize: 14, lineHeight: 1.6 }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(c.content) }}
                />
              </div>
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
