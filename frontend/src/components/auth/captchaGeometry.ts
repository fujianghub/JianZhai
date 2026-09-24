/**
 * 拼图验证码的显示几何（2026-09-24）。
 *
 * 服务端按图像像素出题/判定（`apps/accounts/captcha.py`，WIDTH 384、容差 8px），
 * 旧实现要求画布严格 1:1 渲染——窄屏（390px 手机）因此撑破卡片。现在画布按容器
 * 宽度等比缩放，所有换算收口在这里：
 *
 * - `scale`      = 显示宽 / 图像宽；拼块 left/top/尺寸均乘 scale 显示。
 * - 滑轨手柄的行程 `travel = trackW - handleW` 线性映射到 x ∈ [0, maxX]（图像像素），
 *   提交的永远是图像像素 x，与缩放无关。
 *
 * **勿再用 CSS transform/zoom 缩放整张画布**：指针位移与图像像素会失配。
 */

export interface PuzzleDims {
  width: number;
  height: number;
  piece_width: number;
  y: number;
}

export interface CaptchaLayout {
  scale: number;
  /** 显示尺寸（CSS px） */
  boxW: number;
  boxH: number;
  pieceSize: number;
  pieceTop: number;
  /** x 的上界（图像像素） */
  maxX: number;
  /** 手柄可移动的 CSS 像素行程 */
  travel: number;
}

export function captchaLayout(p: PuzzleDims, containerW: number, handleW: number): CaptchaLayout {
  const boxW = containerW > 0 ? containerW : p.width;
  const scale = boxW / p.width;
  const maxX = p.width - p.piece_width;
  return {
    scale,
    boxW,
    boxH: p.height * scale,
    pieceSize: p.piece_width * scale,
    pieceTop: p.y * scale,
    maxX,
    travel: Math.max(1, boxW - handleW),
  };
}

export function clampX(x: number, maxX: number): number {
  return Math.max(0, Math.min(maxX, x));
}

/** 手柄 CSS 位移 → 图像像素 x */
export function handleToImageX(handlePx: number, l: CaptchaLayout): number {
  return clampX((handlePx / l.travel) * l.maxX, l.maxX);
}

/** 图像像素 x → 手柄 CSS 位移 */
export function imageXToHandle(x: number, l: CaptchaLayout): number {
  return (clampX(x, l.maxX) / l.maxX) * l.travel;
}

/** 图像像素 x → 拼块显示 left（CSS px） */
export function imageXToPiece(x: number, l: CaptchaLayout): number {
  return clampX(x, l.maxX) * l.scale;
}
