import { useEffect, useRef, useState } from 'react';
import { Tooltip } from 'antd';
import {
  ExpandOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  AlignLeftOutlined,
  AlignCenterOutlined,
  AlignRightOutlined,
} from '@ant-design/icons';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { uploadFile } from '@/api/attachments';
import { message } from '@/utils/notify';
import ImageCropModal from './ImageCropModal';

const MIN_WIDTH = 60;
const MAX_WIDTH = 1280;
const ZOOM_PRESETS: Array<{ label: string; value: number }> = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '100%', value: 1 },
  { label: '150%', value: 1.5 },
  { label: '200%', value: 2 },
];

/**
 * Image NodeView with a hover toolbar (rotate / preset zoom / align / crop)
 * plus the bottom-right drag handle for free resizing.
 *
 * The toolbar appears whenever the image is hovered or focused — no need to
 * click into a modal first.
 */
export default function ImageNodeView({
  node,
  updateAttributes,
  selected,
  editor,
  extension,
}: NodeViewProps) {
  const src = node.attrs.src as string;
  const alt = (node.attrs.alt as string | null) ?? '';
  const align = (node.attrs.textAlign as 'left' | 'center' | 'right' | null) ?? null;
  const storedWidth = node.attrs.width ? Number(node.attrs.width) : null;
  const rotation = Number(node.attrs.rotation) || 0;
  const documentId = (extension.options as { documentId?: number }).documentId;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [draftWidth, setDraftWidth] = useState<number | null>(storedWidth);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  // Hover state — toolbar shows on hover, persists if image is selected.
  const [hover, setHover] = useState(false);

  const caption = (node.attrs.caption as string | null) ?? '';
  const [captionDraft, setCaptionDraft] = useState(caption);
  const [captionFocused, setCaptionFocused] = useState(false);

  useEffect(() => {
    if (!captionFocused) setCaptionDraft((node.attrs.caption as string | null) ?? '');
  }, [node.attrs.caption, captionFocused]);

  useEffect(() => {
    setDraftWidth(storedWidth);
  }, [storedWidth]);

  function rotate(delta: number) {
    const next = ((rotation + delta) % 360 + 360) % 360;
    updateAttributes({ rotation: next });
  }

  function setZoom(ratio: number) {
    const base = naturalWidth ?? imgRef.current?.naturalWidth ?? 800;
    const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(base * ratio)));
    updateAttributes({ width: next });
  }

  function setAlign(value: 'left' | 'center' | 'right') {
    // Use TextAlign extension's API so the attribute lives on the node.
    editor.chain().focus().setTextAlign(value).run();
  }

  async function handleCropApply(blob: Blob) {
    if (cropping) return;
    setCropping(true);
    try {
      const name = (alt || 'cropped') + '.png';
      const file = new File([blob], name.replace(/[^\w.\-一-龥]+/g, '_'), {
        type: 'image/png',
      });
      const att = await uploadFile(file, documentId);
      updateAttributes({ src: att.url, width: null, height: null });
      setCropOpen(false);
      message.success('裁剪完成');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '裁剪上传失败');
    } finally {
      setCropping(false);
    }
  }

  function startResize(e: React.MouseEvent<HTMLSpanElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!editor.isEditable || !imgRef.current) return;

    const startX = e.clientX;
    const startWidth = imgRef.current.getBoundingClientRect().width;

    function onMove(ev: MouseEvent) {
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + (ev.clientX - startX)));
      setDraftWidth(Math.round(next));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const final = imgRef.current
        ? Math.round(imgRef.current.getBoundingClientRect().width)
        : null;
      if (final && Math.abs(final - startWidth) > 1) {
        updateAttributes({ width: final });
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const wrapperStyle: React.CSSProperties = {
    textAlign: align ?? undefined,
  };

  const widthPx = draftWidth ? `${draftWidth}px` : undefined;
  const imgStyle: React.CSSProperties = {
    maxWidth: '100%',
    height: 'auto',
    width: widthPx,
    display: 'inline-block',
    outline: selected ? '2px solid var(--jz-accent)' : 'none',
    outlineOffset: '2px',
    borderRadius: 4,
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    transformOrigin: 'center center',
    transition: 'transform 0.18s ease',
  };

  const showToolbar = editor.isEditable && (hover || selected);

  return (
    <NodeViewWrapper
      ref={containerRef}
      className="jz-image-nodeview"
      style={wrapperStyle}
      data-selected={selected || undefined}
    >
      <span
        style={{ position: 'relative', display: 'inline-block' }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          style={imgStyle}
          draggable={false}
          onLoad={(e) => setNaturalWidth(e.currentTarget.naturalWidth)}
        />
        {showToolbar && (
          <>
            <div className="jz-image-toolbar jz-image-toolbar-expanded" contentEditable={false}>
              <Tooltip title="逆时针旋转 90°">
                <button
                  type="button"
                  className="jz-image-toolbar-btn"
                  onClick={(e) => { e.stopPropagation(); rotate(-90); }}
                >
                  <RotateLeftOutlined />
                </button>
              </Tooltip>
              <Tooltip title="顺时针旋转 90°">
                <button
                  type="button"
                  className="jz-image-toolbar-btn"
                  onClick={(e) => { e.stopPropagation(); rotate(90); }}
                >
                  <RotateRightOutlined />
                </button>
              </Tooltip>
              <span className="jz-image-toolbar-divider" />
              {ZOOM_PRESETS.map((z) => (
                <Tooltip key={z.label} title={`缩放到 ${z.label}`}>
                  <button
                    type="button"
                    className="jz-image-toolbar-btn jz-image-toolbar-btn-text"
                    onClick={(e) => { e.stopPropagation(); setZoom(z.value); }}
                  >
                    {z.label}
                  </button>
                </Tooltip>
              ))}
              <Tooltip title="还原原始尺寸">
                <button
                  type="button"
                  className="jz-image-toolbar-btn jz-image-toolbar-btn-text"
                  onClick={(e) => { e.stopPropagation(); updateAttributes({ width: null, height: null }); }}
                >
                  原始
                </button>
              </Tooltip>
              <span className="jz-image-toolbar-divider" />
              <Tooltip title="左对齐">
                <button
                  type="button"
                  className={'jz-image-toolbar-btn' + (align === 'left' ? ' is-active' : '')}
                  onClick={(e) => { e.stopPropagation(); setAlign('left'); }}
                >
                  <AlignLeftOutlined />
                </button>
              </Tooltip>
              <Tooltip title="居中">
                <button
                  type="button"
                  className={'jz-image-toolbar-btn' + (align === 'center' ? ' is-active' : '')}
                  onClick={(e) => { e.stopPropagation(); setAlign('center'); }}
                >
                  <AlignCenterOutlined />
                </button>
              </Tooltip>
              <Tooltip title="右对齐">
                <button
                  type="button"
                  className={'jz-image-toolbar-btn' + (align === 'right' ? ' is-active' : '')}
                  onClick={(e) => { e.stopPropagation(); setAlign('right'); }}
                >
                  <AlignRightOutlined />
                </button>
              </Tooltip>
              <span className="jz-image-toolbar-divider" />
              <Tooltip title="裁剪">
                <button
                  type="button"
                  className="jz-image-toolbar-btn"
                  onClick={(e) => { e.stopPropagation(); setCropOpen(true); }}
                  aria-label="裁剪图片"
                >
                  <ExpandOutlined />
                </button>
              </Tooltip>
            </div>
            <span
              role="slider"
              aria-label="拖拽调整图片宽度"
              className="jz-image-resize-handle"
              onMouseDown={startResize}
            />
          </>
        )}
      </span>

      {cropOpen && (
        <ImageCropModal
          open={cropOpen}
          src={src}
          onCancel={() => setCropOpen(false)}
          onApply={handleCropApply}
        />
      )}
      {editor.isEditable && (
        <div
          className="jz-image-caption-wrap"
          contentEditable={false}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            className="jz-image-caption-input"
            placeholder="添加说明…"
            value={captionDraft}
            onChange={(e) => setCaptionDraft(e.target.value)}
            onFocus={() => setCaptionFocused(true)}
            onBlur={() => {
              setCaptionFocused(false);
              updateAttributes({ caption: captionDraft.trim() || null });
            }}
          />
        </div>
      )}
      {!editor.isEditable && caption && (
        <div className="jz-image-caption-display">{caption}</div>
      )}
    </NodeViewWrapper>
  );
}
