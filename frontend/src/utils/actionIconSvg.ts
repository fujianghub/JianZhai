/**
 * innerHTML 面的动作图标（2026-09-02 从 markdown.ts 抽出并扩充）。
 *
 * 阅读页代码块工具条 / 图表浮动动作行 / 图表与图片全屏工具条 / 文档卡片等
 * 由字符串拼装 DOM，拿不到 React 组件，此前用 ``▾ ⧉ ⋯ ⤢ ⤓ ✕ 📄`` 等 unicode
 * 字形代替图标，跨字体/平台渲染不一致且读屏会念成符号名。这里统一成
 * 24×24 / 1.8px round / ``currentColor`` 的内联 SVG（与 JzIcon 线稿同一视觉
 * 重量），只输出 DOMPurify 允许的属性，``fill="none"`` 描边不依赖
 * ``--jz-icon-*`` 令牌，所以不受 portal 作用域影响。
 */

export const ACTION_ICON_PATHS = {
  source: '<path d="m8.5 8-4 4 4 4"/><path d="m15.5 8 4 4-4 4"/>',
  copy:
    '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/>' +
    '<path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  download: '<path d="M12 3.5v11"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/><path d="M4.5 20.5h15"/>',
  fullscreen:
    '<path d="M9 3.5H4.5V8"/><path d="M15 3.5h4.5V8"/>' +
    '<path d="M9 20.5H4.5V16"/><path d="M15 20.5h4.5V16"/>',
  /** 适应窗口：四角向内 */
  fit:
    '<path d="M4.5 9V4.5H9"/><path d="M19.5 9V4.5H15"/>' +
    '<path d="M4.5 15v4.5H9"/><path d="M19.5 15v4.5H15"/><path d="m4.5 4.5 5 5M19.5 4.5l-5 5M4.5 19.5l5-5M19.5 19.5l-5-5"/>',
  caret: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
  more: '<circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  'zoom-in': '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/><path d="M11 8v6M8 11h6"/>',
  'zoom-out': '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/><path d="M8 11h6"/>',
  doc: '<path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14 3.5v4h4"/><path d="M8.5 12h7M8.5 15.5h5"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  cross: '<path d="M5.5 5.5 18.5 18.5"/><path d="M18.5 5.5 5.5 18.5"/>',
} as const;

export type ActionIconName = keyof typeof ACTION_ICON_PATHS;

export interface ActionIconSvgOptions {
  /** 像素尺寸（默认 16） */
  size?: number;
  /** 描边宽度（默认 1.8；反馈勾/叉用 2） */
  strokeWidth?: number;
  /** 额外 class（默认 `jz-diagram-action-svg`，沿用既有样式钩子） */
  className?: string;
}

export function actionIconSvg(name: ActionIconName, opts: ActionIconSvgOptions = {}): string {
  const size = opts.size ?? 16;
  const sw = opts.strokeWidth ?? 1.8;
  const cls = opts.className ?? 'jz-diagram-action-svg';
  return (
    `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
    `fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${ACTION_ICON_PATHS[name]}</svg>`
  );
}

/** 把 SVG 字符串变成可插入的节点（受信常量，非用户内容）。 */
export function actionIconNode(name: ActionIconName, opts?: ActionIconSvgOptions): SVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = actionIconSvg(name, opts);
  return tpl.content.firstElementChild as SVGElement;
}
