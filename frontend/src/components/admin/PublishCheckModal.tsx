import { Modal, Typography } from 'antd';
import { CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import type { DocumentDetail } from '@/types';

const { Text } = Typography;

export interface PublishCheckItem {
  level: 'ok' | 'warn' | 'error';
  message: string;
}

export function buildPublishChecks(
  doc: DocumentDetail,
  kb?: { name: string; visibility: string } | null,
  opts?: { body?: string },
): PublishCheckItem[] {
  const items: PublishCheckItem[] = [];
  const title = doc.title?.trim();
  const body = (opts?.body ?? doc.raw_content ?? doc.published_content ?? '').trim();

  if (!title) {
    items.push({ level: 'error', message: '标题为空，请先填写标题' });
  } else {
    items.push({ level: 'ok', message: `标题：${title}` });
  }

  if (!body) {
    items.push({ level: 'warn', message: '正文为空，发布后将显示空白文章' });
  } else {
    items.push({ level: 'ok', message: `正文约 ${body.length} 字符` });
  }

  if (doc.visibility !== 'public') {
    items.push({
      level: 'warn',
      message: '文档可见性为「私密」，访客无法在博客阅读（仅登录后台可见）',
    });
  } else {
    items.push({ level: 'ok', message: '文档已设为公开' });
  }

  if (kb && kb.visibility !== 'public') {
    items.push({
      level: 'warn',
      message: `所属知识库「${kb.name}」未公开，博客侧可能无法按 KB 浏览`,
    });
  } else if (kb) {
    items.push({ level: 'ok', message: `知识库「${kb.name}」已公开` });
  }

  if (!doc.slug?.trim()) {
    items.push({ level: 'error', message: '缺少 slug，无法生成稳定链接' });
  } else {
    items.push({ level: 'ok', message: `链接 slug：${doc.slug}` });
  }

  return items;
}

export function hasPublishBlockers(items: PublishCheckItem[]): boolean {
  return items.some((i) => i.level === 'error');
}

interface Props {
  open: boolean;
  items: PublishCheckItem[];
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PublishCheckModal({
  open,
  items,
  loading,
  onConfirm,
  onCancel,
}: Props) {
  const blocked = hasPublishBlockers(items);

  return (
    <Modal
      title="发布前检查"
      open={open}
      onOk={onConfirm}
      onCancel={onCancel}
      okText={blocked ? '无法发布' : '确认发布'}
      okButtonProps={{ disabled: blocked, loading }}
      cancelText="取消"
      destroyOnHidden
    >
      <ul className="jz-publish-check-list">
        {items.map((item, idx) => (
          <li key={idx} className={`jz-publish-check-item jz-publish-check-item--${item.level}`}>
            {item.level === 'ok' ? (
              <CheckCircleOutlined className="jz-publish-check-icon" />
            ) : (
              <WarningOutlined className="jz-publish-check-icon" />
            )}
            <Text>{item.message}</Text>
          </li>
        ))}
      </ul>
      {blocked ? (
        <Text type="danger" style={{ display: 'block', marginTop: 12 }}>
          请先修正标红项后再发布。
        </Text>
      ) : null}
    </Modal>
  );
}
