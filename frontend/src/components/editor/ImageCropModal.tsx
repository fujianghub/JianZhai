import { useRef, useState } from 'react';
import { Modal, Space } from 'antd';
import ReactCrop, { type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface Props {
  open: boolean;
  /** Image to crop — same URL the user clicked. Must be same-origin (or have
   *  CORS) so canvas drawImage doesn't taint and toBlob can succeed. */
  src: string;
  onCancel: () => void;
  /** Called with the cropped result as a PNG ``Blob``; caller is responsible
   *  for uploading + replacing the original image src. */
  onApply: (blob: Blob) => Promise<void> | void;
}

/**
 * Antd Modal wrapping `react-image-crop`. Free-form rectangular crop; no
 * forced aspect ratio so users can pick whatever region they want.
 *
 * Conversion to a Blob uses an offscreen canvas at the image's natural
 * resolution — the rendered crop preview is scaled but the output is at
 * full source quality.
 */
export default function ImageCropModal({ open, src, onCancel, onApply }: Props) {
  // ReactCrop 的 onChange 第一个参数始终是 PixelCrop（与图像渲染坐标对齐），
  // 我们用它直接喂给 canvas drawImage。
  const [crop, setCrop] = useState<PixelCrop | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  function reset() {
    setCrop(undefined);
    setBusy(false);
  }

  async function handleOk() {
    const img = imgRef.current;
    if (!img || !crop || crop.width === 0 || crop.height === 0) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      const sx = Math.round(crop.x * scaleX);
      const sy = Math.round(crop.y * scaleY);
      const sw = Math.round(crop.width * scaleX);
      const sh = Math.round(crop.height * scaleY);
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d 上下文创建失败');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob 返回空'))),
          'image/png',
          0.95,
        );
      });
      await onApply(blob);
      reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="裁剪图片"
      okText="应用裁剪"
      cancelText="取消"
      onCancel={() => {
        reset();
        onCancel();
      }}
      onOk={handleOk}
      confirmLoading={busy}
      width={Math.min(960, window.innerWidth - 80)}
      // 重新挂载图片时清掉上一次的 crop 选区
      destroyOnHidden
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div style={{ color: 'var(--jz-text-muted)', fontSize: 12 }}>
          拖拽鼠标在图片上画一个矩形选区，确定后输出 PNG 原分辨率裁剪结果。
        </div>
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            background: 'var(--jz-surface-2)',
            border: '1px solid var(--jz-border)',
            borderRadius: 6,
            padding: 8,
            maxHeight: 'min(70vh, 600px)',
            overflow: 'auto',
          }}
        >
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            keepSelection
          >
            <img
              ref={imgRef}
              src={src}
              crossOrigin="anonymous"
              alt=""
              style={{ maxWidth: '100%', maxHeight: 'min(60vh, 540px)' }}
            />
          </ReactCrop>
        </div>
        {crop && crop.width > 0 && (
          <div style={{ color: 'var(--jz-text-muted)', fontSize: 12 }}>
            选区: {Math.round(crop.width)} × {Math.round(crop.height)} px
          </div>
        )}
      </Space>
    </Modal>
  );
}

