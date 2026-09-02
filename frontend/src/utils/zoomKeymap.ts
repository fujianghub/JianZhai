import { matchesChord } from '@/shortcuts/keys';

/**
 * 图片灯箱 / 图表全屏共用的键盘缩放（此前 useImageLightbox 与 diagramFullscreen
 * 各写一份 Esc / 0 / + / -）。键位登记在注册表 `lightbox.*`。
 */
export interface ZoomKeyHandlers {
  onClose: () => void;
  onFit: () => void;
  onZoom: (factor: number) => void;
}

export function makeZoomKeyHandler(h: ZoomKeyHandlers): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (matchesChord(e, 'Escape')) {
      h.onClose();
    } else if (matchesChord(e, '0')) {
      e.preventDefault();
      h.onFit();
    } else if (matchesChord(e, '+') || matchesChord(e, '=')) {
      e.preventDefault();
      h.onZoom(1.25);
    } else if (matchesChord(e, '-') || matchesChord(e, '_')) {
      e.preventDefault();
      h.onZoom(1 / 1.25);
    }
  };
}
