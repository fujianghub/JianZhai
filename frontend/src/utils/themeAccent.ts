/** 主题主色的唯一来源是 CSS（tokens.css 各 [data-theme=…] 的 --jz-accent）。
 * AntD 的 colorPrimary 在运行时读同一枚变量，而不是再维护一份 JS 色表——
 * 两份硬编码曾实际漂移（dark 的 #02b377 vs #2ee79c）。调用时机上要求
 * data-theme 已打到 <html>（theme store 保证 applyToDocument 先于 set）。 */
export const DEFAULT_ACCENT = '#02b377';

export function readThemeAccent(): string {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return DEFAULT_ACCENT;
  }
  const v = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--jz-accent')
    .trim();
  return v || DEFAULT_ACCENT;
}
