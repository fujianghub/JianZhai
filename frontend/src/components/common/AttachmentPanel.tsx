import { useCallback, useEffect, useState } from 'react';
import { Button, Empty, List, Popconfirm, Space, Tag, Typography, Upload } from 'antd';
import { message } from '@/utils/notify';
import { DeleteOutlined, EyeOutlined, FileOutlined, FilePdfOutlined, FileTextOutlined, FileWordOutlined, PaperClipOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import * as attApi from '@/api/attachments';
import { previewKind, type Attachment } from '@/api/attachments';
import FilePreview from './FilePreview';
import { formatApiError } from '@/api/client';

const { Title, Text } = Typography;

interface Props {
  documentId: number;
  /** When true, hides the section header title and removes the top border / margin (used inside the tabbed sidebar). */
  compact?: boolean;
}

export default function AttachmentPanel({ documentId, compact = false }: Props) {
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [previewing, setPreviewing] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    setItems(await attApi.listDocumentAttachments(documentId));
  }, [documentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      await attApi.uploadFile(file, documentId);
      message.success(`已上传 ${file.name}`);
      await refresh();
    } catch (err) {
      message.error(formatApiError(err, '上传失败'));
    } finally {
      setUploading(false);
    }
    return false; // prevent default upload behavior
  }

  async function handleDelete(id: number) {
    try {
      await attApi.deleteAttachment(id);
      await refresh();
    } catch (err) {
      message.error(formatApiError(err, '删除失败'));
    }
  }

  return (
    <div style={compact ? { padding: '8px 0' } : { borderTop: '1px solid var(--jz-divider)', paddingTop: 16, marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        {!compact && (
          <Title level={5} style={{ margin: 0 }}>
            <PaperClipOutlined /> 附件 <Text type="secondary">({items?.length ?? 0})</Text>
          </Title>
        )}
        <Upload
          beforeUpload={(file) => handleUpload(file as File)}
          showUploadList={false}
          multiple
          accept=".pdf,.doc,.docx,.ppt,.pptx,.html,.htm,.md,.markdown,.txt,.jpg,.jpeg,.png,.gif,.webp,.svg,.zip,.csv,.json,.xml"
        >
          <Button icon={<UploadOutlined />} loading={uploading}>
            上传文件
          </Button>
        </Upload>
      </div>

      {items === null ? null : items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有附件" />
      ) : (
        <List
          dataSource={items}
          renderItem={(a) => (
            <List.Item
              actions={[
                <Button
                  key="preview"
                  size="small"
                  type="link"
                  icon={<EyeOutlined />}
                  onClick={() => setPreviewing(a)}
                >
                  预览
                </Button>,
                <Popconfirm
                  key="del"
                  title="删除该附件？"
                  onConfirm={() => handleDelete(a.id)}
                >
                  <Button size="small" type="text" icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <Space>
                <KindIcon attachment={a} />
                <div>
                  <div style={{ fontWeight: 500 }}>{a.original_filename}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {(a.size / 1024).toFixed(1)} KB · {dayjs(a.created_at).format('YYYY-MM-DD HH:mm')}
                  </Text>
                </div>
                <Tag>{labelFor(a)}</Tag>
              </Space>
            </List.Item>
          )}
        />
      )}

      <FilePreview
        open={previewing !== null}
        attachment={previewing}
        onClose={() => setPreviewing(null)}
      />
    </div>
  );
}

function KindIcon({ attachment }: { attachment: Attachment }) {
  const k = previewKind(attachment);
  const style = { fontSize: 22, color: 'var(--jz-accent)' };
  if (k === 'pdf') return <FilePdfOutlined style={style} />;
  if (k === 'docx') return <FileWordOutlined style={style} />;
  if (k === 'image') return <PictureOutlined style={style} />;
  if (k === 'md' || k === 'text' || k === 'html') return <FileTextOutlined style={style} />;
  return <FileOutlined style={style} />;
}

function labelFor(a: Attachment): string {
  return previewKind(a).toUpperCase();
}
