import { useEffect, useState } from 'react';
import { Alert, Modal, Radio, Space, Switch, Typography } from 'antd';
import { message } from '@/utils/notify';
import { formatApiError } from '@/api/client';
import * as exportsApi from '@/api/exports';
import type { ExportFormat, ExportScope } from '@/api/exports';
import { watchExport } from '@/stores/exportWatch';

const { Text, Paragraph } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  scope: ExportScope;
  /** Used for doc/folder/kb scopes; ignored when scope="selection". */
  targetId?: number;
  targetLabel: string;
  /** scope="selection" only: picked folders (expanded server-side to their subtree). */
  folderIds?: number[];
  /** scope="selection" only: individually picked documents. */
  docIds?: number[];
  /** Whether to restrict available formats — single-doc PDF makes sense; static site does not. */
  allowSiteFormat?: boolean;
  onSubmitted?: () => void;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: 'md', label: 'Markdown', hint: '发布版 Markdown，单文件或 zip 打包' },
  { value: 'html', label: 'HTML', hint: '单页 HTML，内联样式与图片' },
  { value: 'pdf', label: 'PDF', hint: 'Playwright 渲染 Chromium，需后端已安装' },
  { value: 'docx', label: 'Word (.docx)', hint: '真标题样式 + 表格 + 图片；多篇含封面与目录域' },
  { value: 'site', label: '整站 zip', hint: '多页 HTML + 目录 + 搜索索引 + RSS（仅已发布）' },
];

export default function ExportDialog({
  open,
  onClose,
  scope,
  targetId,
  targetLabel,
  folderIds = [],
  docIds = [],
  allowSiteFormat = true,
  onSubmitted,
}: Props) {
  const [format, setFormat] = useState<ExportFormat>('md');
  const [onlyPublished, setOnlyPublished] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setFormat('md');
      setOnlyPublished(false);
    }
  }, [open]);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      // 开关未开 = 不传字段（保持后端历史行为）；site 服务端恒过滤已发布。
      const published = onlyPublished && format !== 'site' ? { only_published: true } : {};
      const task =
        scope === 'selection'
          ? await exportsApi.createExport({
              scope,
              format,
              folder_ids: folderIds,
              doc_ids: docIds,
              ...published,
            })
          : await exportsApi.createExport({ scope, target_id: targetId, format, ...published });
      // 实况胶囊接管进度展示（跨页面常驻，完成即可下载）
      watchExport(task);
      message.success(
        onSubmitted ? '已创建导出任务，正在前往导出历史…' : '已创建导出任务，进度见左下角胶囊。',
      );
      onSubmitted?.();
      onClose();
    } catch (err: unknown) {
      message.error(formatApiError(err, '导出失败'));
    } finally {
      setSubmitting(false);
    }
  }

  const options = allowSiteFormat
    ? FORMAT_OPTIONS
    : FORMAT_OPTIONS.filter((o) => o.value !== 'site');

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`导出：${targetLabel}`}
      onOk={handleSubmit}
      okButtonProps={{ loading: submitting }}
      okText="开始导出"
      cancelText="取消"
    >
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        范围：
        {scope === 'doc'
          ? '单文档'
          : scope === 'folder'
            ? '文件夹（含子级）'
            : scope === 'kb'
              ? '整知识库'
              : `已选 ${docIds.length} 篇文档 · ${folderIds.length} 个文件夹（含子级，合并为一个文件）`}
      </Paragraph>
      {format === 'site' ? (
        <Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 12 }}>
          整站导出仅包含已发布文档，不含任何草稿内容。
        </Paragraph>
      ) : (
        <Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 12 }}>
          <Switch
            size="small"
            checked={onlyPublished}
            onChange={setOnlyPublished}
            style={{ marginRight: 8 }}
          />
          仅导出已发布文档
          {onlyPublished
            ? '（未发布的草稿将被排除）'
            : '（默认包含全部：已发布用发布版正文，未发布用草稿）'}
        </Paragraph>
      )}
      <Radio.Group
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        style={{ width: '100%' }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {options.map((o) => (
            <Radio key={o.value} value={o.value} style={{ width: '100%' }}>
              <Text strong>{o.label}</Text>{' '}
              <Text type="secondary" style={{ fontSize: 12 }}>
                {o.hint}
              </Text>
            </Radio>
          ))}
        </Space>
      </Radio.Group>
      {format === 'pdf' && (
        <Alert
          style={{ marginTop: 12 }}
          type="info"
          showIcon
          message="PDF 由服务器渲染生成，耗时较其他格式略长；若任务持续失败，请联系管理员检查导出服务。"
        />
      )}
    </Modal>
  );
}
