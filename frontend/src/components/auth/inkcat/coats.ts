/**
 * 小猫毛色（2026-09-25 六期）：只有黑、白两种，随主题明暗自动换——
 * 浅色系主题（light / springwater / wintersnow）= 黑猫（黑身 + 白口鼻 + 白爪），
 * 暗色系主题（dark / starry / deepsea）= 纯白猫（双蓝眼）。
 * 明暗判定复用 stores/theme 的 isLightTheme（与 AntD 算法、color-scheme 同源）。
 * 色值在 styles/login.css：`.jz-inkcat` 默认令牌 = 黑猫，`[data-coat='white']` = 白猫。
 */
import { isLightTheme, type ThemeMode } from '@/stores/theme';

export type CoatId = 'black' | 'white';

export function coatForTheme(mode: ThemeMode): CoatId {
  return isLightTheme(mode) ? 'black' : 'white';
}
