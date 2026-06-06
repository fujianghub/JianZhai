import { useRef, useState } from 'react';
import { Button, Empty, List, Modal, Typography } from 'antd';
import {
  DeleteOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import { message } from '@/utils/notify';
import {
  collectPickedFiles,
  mergeCollected,
  pickedRootFolderName,
  type CollectedUploads,
} from '@/utils/uploadBatch';

/**
 * 多文件夹上传 Modal（个人空间 + 博客端共用）。
 *
 * 浏览器的 webkitdirectory 选择器一次只能选一个文件夹，这里用「累积暂存」
 * 突破限制：反复点「添加文件夹」攒成列表（可移除、同名替换），最后合并
 * 一次性交给调用方分片上传。拖拽多个文件夹则直接走页面 UploadDropZone。
 */
interface StagedFolder {
  name: string;
  collected: CollectedUploads;
}

interface Props {
  open: boolean;
  /** 主题色，默认走全局 accent。 */
  accent?: string;
  onCancel: () => void;
  /** 点击「开始上传」：所有暂存文件夹合并后的收集结果。 */
  onConfirm: (collected: CollectedUploads) => void;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function FolderUploadModal({ open, accent, onCancel, onConfirm }: Props) {
  const [staged, setStaged] = useState<StagedFolder[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const totalFiles = staged.reduce((s, f) => s + f.collected.items.length, 0);
  const totalSkipped = staged.reduce((s, f) => s + f.collected.skipped.length, 0);

  function handlePicked(files: FileList) {
    const name = pickedRootFolderName(files);
    const collected = collectPickedFiles(files, true);
    if (collected.items.length === 0) {
      message.warning(`「${name}」中没有可上传的文件`);
      return;
    }
    setStaged((prev) => {
      const exists = prev.some((f) => f.name === name);
      if (exists) message.info(`已替换同名文件夹「${name}」`);
      return [...prev.filter((f) => f.name !== name), { name, collected }];
    });
  }

  function handleCancel() {
    setStaged([]);
    onCancel();
  }

  function handleConfirm() {
    const merged = mergeCollected(staged.map((s) => s.collected));
    setStaged([]);
    onConfirm(merged);
  }

  return (
    <Modal
      open={open}
      title="上传文件夹（保留目录结构）"
      onCancel={handleCancel}
      width={520}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          取消
        </Button>,
        <Button
          key="ok"
          type="primary"
          disabled={totalFiles === 0}
          onClick={handleConfirm}
        >
          {staged.length > 0
            ? `开始上传（${staged.length} 个文件夹 · ${totalFiles} 个文件）`
            : '开始上传'}
        </Button>,
      ]}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        // @ts-expect-error — webkitdirectory is a non-standard but widely supported attribute.
        webkitdirectory="true"
        directory="true"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length) handlePicked(e.target.files);
          e.target.value = '';
        }}
      />

      {staged.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有添加文件夹"
          style={{ padding: '12px 0' }}
        />
      ) : (
        <List
          size="small"
          dataSource={staged}
          renderItem={(f) => {
            const bytes = f.collected.items.reduce((s, it) => s + it.file.size, 0);
            return (
              <List.Item
                actions={[
                  <Button
                    key="rm"
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() =>
                      setStaged((prev) => prev.filter((x) => x.name !== f.name))
                    }
                  />,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <FolderOpenOutlined
                      style={{ fontSize: 20, color: accent ?? 'var(--jz-accent)' }}
                    />
                  }
                  title={f.name}
                  description={
                    `${f.collected.items.length} 个文件 · ${fmtSize(bytes)}` +
                    (f.collected.skipped.length
                      ? ` · 跳过 ${f.collected.skipped.length} 个`
                      : '')
                  }
                />
              </List.Item>
            );
          }}
        />
      )}

      <Button
        block
        type="dashed"
        icon={<FolderAddOutlined />}
        style={{ marginTop: 12 }}
        onClick={() => inputRef.current?.click()}
      >
        添加文件夹（可反复添加多个）
      </Button>
      <Typography.Text
        type="secondary"
        style={{ display: 'block', marginTop: 8, fontSize: 12 }}
      >
        每次选择一个文件夹，可反复添加后一次上传；也可以关闭本窗口，直接把多个
        文件夹一起拖拽到文档列表。
        {totalSkipped > 0 && `（共 ${totalSkipped} 个文件将被跳过：隐藏/超限/不支持的类型）`}
      </Typography.Text>
    </Modal>
  );
}
