import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { CloudUploadOutlined } from '@ant-design/icons';
import { collectDroppedItems, type CollectedUploads } from '@/utils/uploadBatch';

/**
 * 拖拽上传包裹层：把 children 区域变成 drop zone，
 * 支持多文件 + 多文件夹混合拖入（递归遍历、保留目录结构）。
 * 个人空间 KBWorkspace 与博客端 KBPostsPage 共用。
 */
interface Props {
  /** true 时完全旁路（如匿名访客、无管理权限）。 */
  disabled?: boolean;
  /** 遮罩主色，默认走主题 accent。 */
  accent?: string;
  hint?: string;
  onDropFiles: (collected: CollectedUploads) => void;
  children: ReactNode;
}

export default function UploadDropZone({
  disabled,
  accent = 'var(--jz-accent)',
  hint = '松开即上传到本知识库（支持多个文件 / 文件夹，保留目录结构）',
  onDropFiles,
  children,
}: Props) {
  const [active, setActive] = useState(false);
  // dragenter/dragleave 在子元素间冒泡成对触发，用深度计数避免遮罩闪烁。
  const depth = useRef(0);

  if (disabled) return <>{children}</>;

  const hasFiles = (e: DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes('Files');

  return (
    <div
      style={{ position: 'relative' }}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setActive(true);
      }}
      onDragOver={(e) => {
        // 必须 preventDefault 浏览器才允许 drop 落在这里而不是打开文件。
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setActive(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setActive(false);
        // collectDroppedItems 在事件同步阶段抓取 entry，之后才异步遍历。
        void collectDroppedItems(e.dataTransfer).then(onDropFiles);
      }}
    >
      {children}
      {active && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 30,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 14,
            border: `2px dashed ${accent}`,
            background: 'color-mix(in srgb, var(--jz-surface, #fff) 82%, transparent)',
            backdropFilter: 'blur(2px)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ textAlign: 'center', color: accent }}>
            <CloudUploadOutlined style={{ fontSize: 34 }} />
            <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600 }}>{hint}</div>
          </div>
        </div>
      )}
    </div>
  );
}
