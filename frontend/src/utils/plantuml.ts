/**
 * PlantUML 渲染：把 ``@startuml ... @enduml`` 源码 base64-DEFLATE 编码后拼接
 * 到 PlantUML 服务的 ``/svg/{encoded}`` 路径上获得 SVG 图。
 *
 * 默认指向公共 plantuml.com 服务；可通过 ``VITE_PLANTUML_BASE_URL`` 切到自建
 * 服务。不上传任何业务数据 —— 编码后的字符串经 DEFLATE + base64 后是不可逆 URL，
 * 但请注意源码本身会随 URL 传到 PlantUML 服务器。
 */
import plantumlEncoder from 'plantuml-encoder';

const DEFAULT_BASE =
  (import.meta.env?.VITE_PLANTUML_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://www.plantuml.com/plantuml';

function currentTheme(): string {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme || 'light';
}

/**
 * Inject a dark-theme `!theme` directive into a PlantUML source if the user
 * hasn't already chosen one. PlantUML ships with built-in themes; ``cerulean``
 * uses dark backgrounds with light text that read cleanly on our dark /
 * starry / deepsea palettes. We never override an author-declared
 * ``!theme`` or ``skinparam`` so power users keep control.
 */
function injectDarkThemeIfNeeded(source: string): string {
  const isDark =
    currentTheme() === 'dark' || currentTheme() === 'starry' || currentTheme() === 'deepsea';
  if (!isDark) return source;
  if (/^\s*!theme\b/im.test(source) || /^\s*skinparam\s+backgroundColor\b/im.test(source)) {
    return source;
  }
  // Insert just after the `@startXXX` opener so PlantUML parses it before any
  // diagram body. If no `@start` is present (rare — PlantUML allows omission
  // in some hosts), prepend at the top.
  const startMatch = source.match(/^(\s*@start\w+[^\n]*\n)/);
  if (startMatch) {
    return startMatch[1] + '!theme cerulean-outline\n' + source.slice(startMatch[1].length);
  }
  return '!theme cerulean-outline\n' + source;
}

/** 返回可直接用于 ``<img src>`` 的 SVG URL。 */
export function plantumlSvgUrl(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return '';
  const themed = injectDarkThemeIfNeeded(trimmed);
  // plantumlEncoder.encode 会做 DEFLATE + 自定义 base64
  const encoded = plantumlEncoder.encode(themed);
  return `${DEFAULT_BASE}/svg/${encoded}`;
}

/** 抓取 SVG 文本（编辑器侧需要把 SVG 嵌进 NodeView 而不是用 img 引用）。 */
export async function fetchPlantumlSvg(source: string): Promise<string> {
  const url = plantumlSvgUrl(source);
  if (!url) return '';
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`PlantUML 渲染失败 (HTTP ${res.status})`);
  const svg = await res.text();
  // If the author baked light backgrounds into their diagram (so our theme
  // injection couldn't help), nudge the resulting SVG to use a transparent
  // backdrop so the canvas's own dark wash shows through. We don't recolour
  // any nodes — that's the author's call.
  return ensureTransparentSvgBackground(svg);
}

function ensureTransparentSvgBackground(svg: string): string {
  // Strip a hardcoded white/cream background that PlantUML occasionally sets
  // on the outer <rect>. Lets our canvas tint show through on dark themes.
  return svg.replace(
    /<rect\b([^>]*)\bfill="(#fff(?:fff)?|white|#fefefe)"([^>]*)\s*\/>/i,
    '<rect$1fill="transparent"$3/>',
  );
}
