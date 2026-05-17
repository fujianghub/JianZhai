import { useState } from 'react';
import { Alert, Modal, Radio, Space, Typography } from 'antd';
import { message } from '@/utils/notify';
import * as exportsApi from '@/api/exports';
import type { ExportFormat, ExportScope } from '@/api/exports';

const { Text, Paragraph } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  scope: ExportScope;
  targetId: number;
  targetLabel: string;
  /** Whether to restrict available formats — single-doc PDF makes sense; static site does not. */
  allowSiteFormat?: boolean;
  onSubmitted?: () => void;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: 'md', label: 'Markdown', hint: '原始 Markdown，单文件或 zip 打包' },
  { value: 'html', label: 'HTML', hint: '单页 HTML，含内联 CSS，无外部依赖' },
  { value: 'pdf', label: 'PDF', hint: 'Playwright 渲染 Chromium，需后端已安装' },
  { value: 'docx', label: 'Word (.docx)', hint: '基础结构（标题/段落/列表/代码块）' },
  { value: 'site', label: '整站 zip', hint: '多页 HTML + 目录 + 搜索索引 + RSS' },
];

export default function ExportDialog({
  open,
  onClose,
  scope,
  targetId,
  targetLabel,
  allowSiteFormat = true,
  onSubmitted,
}: Props) {
  const [format, setFormat] = useState<ExportFormat>('md');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await exportsApi.createExport({ scope, target_id: targetId, format });
      message.success('已创建导出任务，请到「导出历史」查看');
      onSubmitted?.();
      onClose();
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
        '导出失败';
      message.error(detail);
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
        范围：{scope === 'doc' ? '单文档' : scope === 'folder' ? '文件夹（含子级）' : '整知识库'}
      </Paragraph>
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
          message="PDF 依赖 Playwright + Chromium，首次失败请在服务器跑 `playwright install chromium`"
        />
      )}
    </Modal>
  );
}
