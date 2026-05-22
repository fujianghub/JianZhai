import { useCallback, useEffect, useRef, useState } from 'react';
import { Dropdown, InputNumber, Popover, Slider, Tooltip } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  ColumnHeightOutlined,
  ExpandOutlined,
  FormatPainterOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  AlignLeftOutlined,
  AlignCenterOutlined,
  AlignRightOutlined,
} from '@ant-design/icons';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { uploadFile } from '@/api/attachments';
import { message } from '@/utils/notify';

const MIN_WIDTH = 60;
const MAX_WIDTH = 1280;
const ZOOM_PRESETS: Array<{ label: string; value: number }> = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5 },
  { label: '200%', value: 2 },
];

const IMAGE_STYLES: Array<{ key: string; label: string }> = [
  { key: '', label: '默认' },
  { key: 'rounded', label: '圆角' },
  { key: 'circle', label: '圆形' },
  { key: 'bordered', label: '边框' },
  { key: 'shadow', label: '阴影' },
  { key: 'shadow-bordered', label: '阴影 + 边框' },
  { key: 'reflection', label: '倒影' },
  { key: 'sepia', label: '老照片' },
];

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'e' | 'w';

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  const storedHeight = node.attrs.height ? Number(node.attrs.height) : null;
  const rotation = Number(node.attrs.rotation) || 0;
  const imageStyle = (node.attrs.imageStyle as string | null) ?? '';
  const documentId = (extension.options as { documentId?: number }).documentId;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [draftWidth, setDraftWidth] = useState<number | null>(storedWidth);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);

  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [cropping, setCropping] = useState(false);

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
    if (cropMode) return;
    const next = ((rotation + delta) % 360 + 360) % 360;
    updateAttributes({ rotation: next });
  }

  function ratioToWidth(ratio: number): number {
    const base = naturalWidth ?? imgRef.current?.naturalWidth ?? 800;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(base * ratio)));
  }

  function commitZoom(ratio: number) {
    setPreviewWidth(null);
    updateAttributes({ width: ratioToWidth(ratio), height: null });
  }

  function setAlign(value: 'left' | 'center' | 'right') {
    editor.chain().focus().setTextAlign(value).run();
  }

  function setImageStyle(key: string) {
    updateAttributes({ imageStyle: key || null });
  }

  /* ── 4 角 / 4 边拖拽 ──────────────────────────────────────────────── */

  function startResize(corner: ResizeHandle) {
    return (e: React.MouseEvent<HTMLSpanElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!editor.isEditable || !imgRef.current || cropMode) return;

      const startX = e.clientX;
      const startWidth = imgRef.current.getBoundingClientRect().width;
      // 左侧手柄拖左→宽变大；右侧手柄拖右→宽变大
      const signX = corner.includes('w') ? -1 : 1;

      function onMove(ev: MouseEvent) {
        const dx = (ev.clientX - startX) * signX;
        const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + dx));
        setDraftWidth(Math.round(next));
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const final = imgRef.current
          ? Math.round(imgRef.current.getBoundingClientRect().width)
          : null;
        if (final && Math.abs(final - startWidth) > 1) {
          updateAttributes({ width: final, height: null });
        }
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  /* ── 行内裁剪 ───────────────────────────────────────────────────────── */

  function enterCropMode() {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const w = rect.width * 0.8;
    const h = rect.height * 0.8;
    setCropRect({
      x: (rect.width - w) / 2,
      y: (rect.height - h) / 2,
      w,
      h,
    });
    setCropMode(true);
  }

  const exitCropMode = useCallback(() => {
    setCropMode(false);
    setCropRect(null);
  }, []);

  function startMoveCrop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!cropRect || !imgRef.current) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { ...cropRect };
    const bounds = imgRef.current.getBoundingClientRect();
    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const nx = Math.max(0, Math.min(bounds.width - start.w, start.x + dx));
      const ny = Math.max(0, Math.min(bounds.height - start.h, start.y + dy));
      setCropRect({ ...start, x: nx, y: ny });
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startResizeCrop(h: Handle) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!cropRect || !imgRef.current) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const start = { ...cropRect };
      const bounds = imgRef.current.getBoundingClientRect();
      const minSize = 30;
      function onMove(ev: MouseEvent) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let { x, y, w, h: hh } = start;
        if (h.includes('w')) { x = Math.max(0, Math.min(start.x + start.w - minSize, start.x + dx)); w = start.w - (x - start.x); }
        if (h.includes('e')) { w = Math.max(minSize, Math.min(bounds.width - x, start.w + dx)); }
        if (h.includes('n')) { y = Math.max(0, Math.min(start.y + start.h - minSize, start.y + dy)); hh = start.h - (y - start.y); }
        if (h.includes('s')) { hh = Math.max(minSize, Math.min(bounds.height - y, start.h + dy)); }
        setCropRect({ x, y, w, h: hh });
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  const applyCrop = useCallback(async () => {
    if (!cropRect || !imgRef.current || cropping) return;
    const displayedWidth = imgRef.current.getBoundingClientRect().width;
    const natural = imgRef.current.naturalWidth;
    if (!displayedWidth || !natural) {
      message.error('图片尚未加载完毕');
      return;
    }
    const ratio = natural / displayedWidth;
    setCropping(true);
    try {
      const res = await fetch(src);
      const blob0 = await res.blob();
      const bitmap = await createImageBitmap(blob0);
      const sx = Math.round(cropRect.x * ratio);
      const sy = Math.round(cropRect.y * ratio);
      const sw = Math.round(cropRect.w * ratio);
      const sh = Math.round(cropRect.h * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d 上下文获取失败');
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
      const outBlob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob 返回 null'))),
          'image/png',
          0.95
        );
      });
      const name = (alt || 'cropped') + '.png';
      const file = new File([outBlob], name.replace(/[^\w.\-一-龥]+/g, '_'), {
        type: 'image/png',
      });
      const att = await uploadFile(file, documentId);
      updateAttributes({ src: att.url, width: null, height: null });
      exitCropMode();
      message.success('裁剪完成');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '裁剪失败');
    } finally {
      setCropping(false);
    }
  }, [alt, cropping, cropRect, documentId, exitCropMode, src, updateAttributes]);

  // 监听键盘 Esc + 点击外部 → 完成裁剪
  useEffect(() => {
    if (!cropMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitCropMode();
      if (e.key === 'Enter') void applyCrop();
    };
    const onDown = (e: MouseEvent) => {
      // 点击在图片容器外 → 视为确认
      const container = containerRef.current;
      if (!container) return;
      if (container.contains(e.target as Node)) return;
      void applyCrop();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [cropMode, applyCrop, exitCropMode]);

  /* ── 渲染 ─────────────────────────────────────────────────────────── */

  const wrapperStyle: React.CSSProperties = { textAlign: align ?? undefined };
  const effectiveWidth = previewWidth ?? draftWidth;
  const widthPx = effectiveWidth ? `${effectiveWidth}px` : undefined;
  const heightPx = storedHeight ? `${storedHeight}px` : undefined;
  const styleClass = imageStyle ? `jz-image-style-${imageStyle}` : '';
  const imgStyle: React.CSSProperties = {
    maxWidth: '100%',
    height: heightPx || 'auto',
    width: widthPx,
    display: 'inline-block',
    outline: selected || cropMode ? '2px solid var(--jz-accent)' : 'none',
    outlineOffset: '2px',
    borderRadius: 4,
    transform: rotation && !cropMode ? `rotate(${rotation}deg)` : undefined,
    transformOrigin: 'center center',
    transition: 'transform 0.18s ease, width 0.18s ease',
  };

  const showToolbar = editor.isEditable && (hover || selected) && !cropMode;

  /* ── 尺寸 Popover ─────────────────────────────────────────────────── */

  const sizePopoverContent = (
    <div className="jz-image-size-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="jz-image-size-row">
        <span className="jz-image-size-key">宽</span>
        <InputNumber
          size="small"
          min={MIN_WIDTH}
          max={MAX_WIDTH}
          step={10}
          value={effectiveWidth ?? naturalWidth ?? undefined}
          onChange={(v) => {
            if (typeof v === 'number') {
              setPreviewWidth(v);
            }
          }}
          onBlur={() => {
            if (previewWidth) {
              updateAttributes({ width: previewWidth, height: null });
              setPreviewWidth(null);
            }
          }}
          addonAfter="px"
          style={{ width: 110 }}
        />
      </div>
      <div className="jz-image-size-row">
        <span className="jz-image-size-key">高</span>
        <InputNumber
          size="small"
          min={20}
          max={2000}
          value={storedHeight ?? undefined}
          placeholder="auto"
          onChange={(v) =>
            updateAttributes({ height: typeof v === 'number' ? v : null })
          }
          addonAfter="px"
          style={{ width: 110 }}
        />
        <button
          type="button"
          className="jz-image-size-reset"
          onClick={() => updateAttributes({ height: null })}
        >
          自适应
        </button>
      </div>
      <div className="jz-image-size-row">
        <span className="jz-image-size-key">缩放</span>
        <Slider
          min={10}
          max={200}
          step={5}
          value={
            effectiveWidth && naturalWidth
              ? Math.round((effectiveWidth / naturalWidth) * 100)
              : 100
          }
          onChange={(v) => setPreviewWidth(ratioToWidth((v as number) / 100))}
          onChangeComplete={(v) => {
            commitZoom((v as number) / 100);
          }}
          style={{ flex: 1, minWidth: 120 }}
        />
        <span className="jz-image-size-pct">
          {effectiveWidth && naturalWidth
            ? Math.round((effectiveWidth / naturalWidth) * 100)
            : 100}
          %
        </span>
      </div>
      <div className="jz-image-size-row jz-image-size-row-presets">
        {ZOOM_PRESETS.map((z) => (
          <button
            key={z.label}
            type="button"
            className="jz-image-size-preset"
            onMouseEnter={() => setPreviewWidth(ratioToWidth(z.value))}
            onMouseLeave={() => setPreviewWidth(null)}
            onClick={() => commitZoom(z.value)}
          >
            {z.label}
          </button>
        ))}
        <button
          type="button"
          className="jz-image-size-preset"
          onClick={() => {
            setPreviewWidth(null);
            updateAttributes({ width: null, height: null });
          }}
        >
          原始
        </button>
      </div>
    </div>
  );

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
          className={styleClass}
          style={imgStyle}
          draggable={false}
          onLoad={(e) => {
            setNaturalWidth(e.currentTarget.naturalWidth);
            setNaturalHeight(e.currentTarget.naturalHeight);
          }}
        />

        {/* ── 行内裁剪覆盖层 ────────────────────────────────────────── */}
        {cropMode && cropRect && (
          <div className="jz-crop-overlay" contentEditable={false}>
            <div className="jz-crop-mask" style={{ left: 0, top: 0, right: 0, height: cropRect.y }} />
            <div className="jz-crop-mask" style={{ left: 0, top: cropRect.y + cropRect.h, right: 0, bottom: 0 }} />
            <div className="jz-crop-mask" style={{ left: 0, top: cropRect.y, width: cropRect.x, height: cropRect.h }} />
            <div className="jz-crop-mask" style={{ left: cropRect.x + cropRect.w, top: cropRect.y, right: 0, height: cropRect.h }} />
            <div
              className="jz-crop-box"
              style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }}
              onMouseDown={startMoveCrop}
            >
              <div className="jz-crop-grid">
                <span /><span /><span /><span />
              </div>
              {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((h) => (
                <span
                  key={h}
                  className={`jz-crop-handle jz-crop-handle-${h}`}
                  onMouseDown={startResizeCrop(h)}
                  aria-label={`调整裁剪 ${h}`}
                />
              ))}
              <div className="jz-crop-action-bar">
                <span className="jz-crop-size">
                  {Math.round(cropRect.w)} × {Math.round(cropRect.h)}
                </span>
                <span className="jz-crop-hint">点击外部完成 · Esc 取消</span>
                <button type="button" className="jz-crop-action jz-crop-cancel"
                  onClick={exitCropMode} onMouseDown={(e) => e.stopPropagation()}
                  title="取消 (Esc)" aria-label="取消裁剪">
                  <CloseOutlined />
                </button>
                <button type="button" className="jz-crop-action jz-crop-confirm"
                  onClick={applyCrop} onMouseDown={(e) => e.stopPropagation()}
                  disabled={cropping} title="确认裁剪 (Enter)" aria-label="确认裁剪">
                  <CheckOutlined />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 工具栏 ───────────────────────────────────────────────── */}
        {showToolbar && (
          <>
            <div className="jz-image-toolbar jz-image-toolbar-expanded" contentEditable={false}>
              <Tooltip title="逆时针旋转 90°">
                <button type="button" className="jz-image-toolbar-btn"
                  onClick={(e) => { e.stopPropagation(); rotate(-90); }}>
                  <RotateLeftOutlined />
                </button>
              </Tooltip>
              <Tooltip title="顺时针旋转 90°">
                <button type="button" className="jz-image-toolbar-btn"
                  onClick={(e) => { e.stopPropagation(); rotate(90); }}>
                  <RotateRightOutlined />
                </button>
              </Tooltip>
              <span className="jz-image-toolbar-divider" />

              {/* 尺寸 Popover */}
              <Popover
                content={sizePopoverContent}
                trigger="click"
                placement="bottom"
                overlayClassName="jz-image-size-popover"
              >
                <Tooltip title="尺寸 / 缩放">
                  <button type="button" className="jz-image-toolbar-btn jz-image-toolbar-btn-text">
                    <ColumnHeightOutlined /> 尺寸
                  </button>
                </Tooltip>
              </Popover>

              {/* 图片样式下拉 */}
              <Dropdown
                menu={{
                  items: IMAGE_STYLES.map((s) => ({
                    key: s.key || '__default__',
                    label: (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span className={`jz-image-style-chip jz-image-style-chip-${s.key || 'none'}`} />
                        {s.label}
                      </span>
                    ),
                    onClick: () => setImageStyle(s.key),
                  })),
                }}
              >
                <Tooltip title="图片样式">
                  <button type="button" className="jz-image-toolbar-btn jz-image-toolbar-btn-text">
                    <FormatPainterOutlined /> 样式
                  </button>
                </Tooltip>
              </Dropdown>

              <span className="jz-image-toolbar-divider" />
              <Tooltip title="左对齐">
                <button type="button" className={'jz-image-toolbar-btn' + (align === 'left' ? ' is-active' : '')}
                  onClick={(e) => { e.stopPropagation(); setAlign('left'); }}>
                  <AlignLeftOutlined />
                </button>
              </Tooltip>
              <Tooltip title="居中">
                <button type="button" className={'jz-image-toolbar-btn' + (align === 'center' ? ' is-active' : '')}
                  onClick={(e) => { e.stopPropagation(); setAlign('center'); }}>
                  <AlignCenterOutlined />
                </button>
              </Tooltip>
              <Tooltip title="右对齐">
                <button type="button" className={'jz-image-toolbar-btn' + (align === 'right' ? ' is-active' : '')}
                  onClick={(e) => { e.stopPropagation(); setAlign('right'); }}>
                  <AlignRightOutlined />
                </button>
              </Tooltip>
              <span className="jz-image-toolbar-divider" />
              <Tooltip title="行内裁剪">
                <button type="button" className="jz-image-toolbar-btn"
                  onClick={(e) => { e.stopPropagation(); enterCropMode(); }}
                  aria-label="裁剪图片">
                  <ExpandOutlined />
                </button>
              </Tooltip>
            </div>

            {/* 4 角 + 4 边手柄 */}
            {(['nw', 'ne', 'sw', 'se', 'e', 'w'] as const).map((h) => (
              <span
                key={h}
                role="slider"
                aria-label={`调整图片大小 ${h}`}
                className={`jz-image-resize-handle jz-image-resize-handle-${h}`}
                onMouseDown={startResize(h)}
              />
            ))}
          </>
        )}
      </span>

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
      {/* keep naturalHeight referenced to avoid unused-var */}
      <span style={{ display: 'none' }}>{naturalHeight ?? ''}</span>
    </NodeViewWrapper>
  );
}
