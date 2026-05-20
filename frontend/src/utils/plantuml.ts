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

/** 返回可直接用于 ``<img src>`` 的 SVG URL。 */
export function plantumlSvgUrl(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return '';
  // plantumlEncoder.encode 会做 DEFLATE + 自定义 base64
  const encoded = plantumlEncoder.encode(trimmed);
  return `${DEFAULT_BASE}/svg/${encoded}`;
}

/** 抓取 SVG 文本（编辑器侧需要把 SVG 嵌进 NodeView 而不是用 img 引用）。 */
export async function fetchPlantumlSvg(source: string): Promise<string> {
  const url = plantumlSvgUrl(source);
  if (!url) return '';
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`PlantUML 渲染失败 (HTTP ${res.status})`);
  return res.text();
}
