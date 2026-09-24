/**
 * 简斋 画板（自托管 draw.io）嵌入协议的纯函数层。
 *
 * 编辑器本体由 caddy（生产）/ Django dev 视图（开发）在同源 `/drawio/` 提供
 * （`infra/drawio/build.py` 产物）。前端以 `<iframe src={buildDrawioEmbedUrl()}>`
 * 打开，用 draw.io 的 JSON postMessage 协议（`embed=1&proto=json`）对话：
 *
 *   iframe → 父页：{event:'init'} → 父页 {action:'load', xml, autosave:1}
 *   iframe → 父页：{event:'load'} / {event:'autosave', xml} / {event:'save', xml, exit?}
 *   父页 → iframe：{action:'export', format:'xmlsvg'|'xmlpng'|…} → {event:'export', data, xml, format}
 *   iframe → 父页：{event:'exit'} / {event:'configure'}（仅 configure=1）
 *
 * 消息体是 **JSON 字符串**（draw.io 侧 `JSON.stringify`），`parseDrawioMessage`
 * 负责解析并过滤非协议消息。所有 targetOrigin 用 `'*'`，来源校验由调用方按
 * `e.source === iframe.contentWindow` 完成（draw.io 自身不校验 origin）。
 *
 * 默认参数与 `infra/drawio/overrides/js/PreConfig.js` 的默认值互补：这里只放
 * 嵌入场景专属项（ui/lang/按钮/库），离线开关等站点级默认由 PreConfig 兜底。
 */

export const DRAWIO_BASE = '/drawio/';
export const DRAWIO_INDEX = `${DRAWIO_BASE}index.html`;

export interface DrawioEmbedOptions {
  /** `min`（默认，简斋决策）或完整 `kennedy`。 */
  ui?: 'min' | 'kennedy';
  lang?: string;
  /** 显示自定义图形库按钮。 */
  libraries?: boolean;
  /** 加载 MathJax（默认关，PreConfig 默认 math=0）。 */
  math?: boolean;
  dark?: boolean;
  /** 只显示「保存并退出」（Ctrl+S 亦为保存并退出）。 */
  saveAndExit?: boolean;
  /** 修改后状态文案资源键；`false` = 不显示。 */
  modified?: string | false;
  /** 内置形状库清单，如 `general;uml`。 */
  libs?: string;
}

export function buildDrawioEmbedUrl(opts: DrawioEmbedOptions = {}): string {
  const p = new URLSearchParams();
  p.set('embed', '1');
  p.set('proto', 'json');
  p.set('spin', '1');
  p.set('ui', opts.ui ?? 'min');
  p.set('lang', opts.lang ?? 'zh');
  if (opts.libraries ?? true) p.set('libraries', '1');
  if (opts.saveAndExit ?? true) {
    p.set('noSaveBtn', '1');
    p.set('saveAndExit', '1');
  }
  if (opts.math) p.set('math', '1');
  if (opts.dark) p.set('dark', '1');
  if (opts.modified === false) p.set('modified', '0');
  else if (opts.modified) p.set('modified', opts.modified);
  if (opts.libs) p.set('libs', opts.libs);
  return `${DRAWIO_INDEX}?${p.toString()}`;
}

/** iframe → 父页 事件。字段按 draw.io `createLoadMessage` / export 回包。 */
export interface DrawioEvent {
  event: 'init' | 'load' | 'autosave' | 'save' | 'export' | 'exit' | 'configure' | 'openLink' | (string & {});
  xml?: string;
  /** export：data URI（svg/png）或纯文本。 */
  data?: string;
  format?: string;
  exit?: boolean;
  modified?: boolean;
  message?: unknown;
  [k: string]: unknown;
}

export type DrawioAction =
  | { action: 'load'; xml?: string; descriptor?: { format: 'mermaid'; data: string; wrap?: boolean; image?: boolean }; autosave?: 0 | 1; title?: string; modified?: string; saveAndExit?: string; noSaveBtn?: string; noExitBtn?: string }
  | { action: 'export'; format: 'xml' | 'xmlsvg' | 'svg' | 'png' | 'xmlpng' | 'html' | 'html2' | 'json'; xml?: string; spin?: string; embedImages?: boolean; scale?: number; border?: number; transparent?: boolean; background?: string; pageId?: string; currentPage?: boolean }
  | { action: 'exit'; modified?: boolean }
  | { action: 'status'; message: string; modified?: boolean }
  | { action: 'spinner'; show: boolean; message?: string }
  | { action: 'dialog'; title: string; message: string; button?: string; modal?: boolean }
  | { action: 'template' }
  | { action: 'configure'; config: Record<string, unknown> };

/** 解析 draw.io 发来的消息；非协议消息（其它 iframe、非 JSON、无 event）返回 null。 */
export function parseDrawioMessage(data: unknown): DrawioEvent | null {
  let obj: unknown = data;
  if (typeof data === 'string') {
    if (!data.startsWith('{')) return null;
    try {
      obj = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const ev = (obj as { event?: unknown }).event;
  if (typeof ev !== 'string' || !ev) return null;
  return obj as DrawioEvent;
}

/** 父页 → iframe：draw.io 只接受 JSON 字符串。 */
export function serializeDrawioAction(action: DrawioAction): string {
  return JSON.stringify(action);
}

/**
 * `xmlsvg` 导出结果里的 mxfile 图源：draw.io 把（PreConfig `compressXml:false`
 * 时明文的）XML 经 HTML 属性转义后放进根 `<svg content="…">`。取不到返回 null。
 */
export function extractDiagramXmlFromSvg(svg: string): string | null {
  const m = /<svg\b[^>]*\scontent="([^"]*)"/i.exec(svg);
  if (!m) return null;
  const raw = m[1]!;
  const decoded = raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#10;/g, '\n')
    .replace(/&#xa;/gi, '\n')
    .replace(/&amp;/g, '&');
  return decoded.startsWith('<mxfile') ? decoded : null;
}

/** data URI（export 事件的 `data`）→ 解码后的文本（仅 svg+xml；PNG 返回 null）。 */
export function decodeSvgDataUri(dataUri: string): string | null {
  const m = /^data:image\/svg\+xml;base64,(.+)$/s.exec(dataUri);
  if (!m) return null;
  try {
    const bin = atob(m[1]!);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }
}

// ── drawio画板 块：存储格式 ─────────────────────────────────────────────────
//
// 正文里一个画板 = 一行原生 HTML（markdown-it html_block，阅读端 / CM6 预览 /
// 导出全部按普通图片渲染，零特判）：
//
//   <figure class="jz-drawio" data-jz-drawio="1" data-png="/media/…png"><img src="/media/…svg" alt="drawio画板" /></figure>
//
// - `img src` = draw.io `xmlsvg` 导出（SVG 根 `content` 属性内嵌 mxfile，再编辑时
//   原样喂回 `load`）；
// - `data-png` = `xmlpng` 导出（PNG tEXt 内嵌 mxfile），供 DOCX 导出（python-docx
//   不吃 SVG）与将来的位图场景；
// - 两者都是本文档的 Attachment，受 /media 闸门（受众 / ReadGrant）约束。

export const DRAWIO_BOARD_NAME = 'drawio画板';

/** 新建画板的空白图（单页）。 */
export const BLANK_DRAWIO_XML =
  '<mxfile><diagram id="jz-p1" name="第 1 页"><mxGraphModel><root>' +
  '<mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';

/** 配色：`auto` = 跟随站点主题（SVG 用 light-dark()，随 `<img>` 的 color-scheme 变），`light` = 始终浅色。 */
export type DrawioScheme = 'auto' | 'light';
/** 尺寸：`auto` = 原始尺寸（不超过版心），`s` = 小（半栏），`full` = 满栏。 */
export type DrawioSize = 'auto' | 's' | 'full';
export type DrawioAlign = 'center' | 'left' | 'right';

export interface DrawioBoardAttrs {
  /** SVG 附件 URL（`/media/…svg`）。 */
  src: string;
  /** PNG 附件 URL（`/media/…png`），可空（老数据 / 导出失败）。 */
  png: string;
  scheme?: DrawioScheme;
  size?: DrawioSize;
  align?: DrawioAlign;
  /** 图注（单行纯文本）。 */
  caption?: string;
}

const escAttr = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 画板 → 正文 HTML（单行，保证 markdown-it 识别为一个 html_block）。默认值不落属性。 */
export function buildDrawioFigureHtml({ src, png, scheme, size, align, caption }: DrawioBoardAttrs): string {
  let attrs = '';
  if (png) attrs += ` data-png="${escAttr(png)}"`;
  if (scheme === 'light') attrs += ' data-jz-scheme="light"';
  if (size === 's' || size === 'full') attrs += ` data-jz-size="${size}"`;
  if (align === 'left' || align === 'right') attrs += ` data-jz-align="${align}"`;
  const cap = (caption ?? '').replace(/\s+/g, ' ').trim();
  return (
    `<figure class="jz-drawio" data-jz-drawio="1"${attrs}>` +
    `<img src="${escAttr(src)}" alt="${DRAWIO_BOARD_NAME}" />` +
    (cap ? `<figcaption>${escAttr(cap)}</figcaption>` : '') +
    '</figure>'
  );
}

/** 只接受本站媒体路径，防止粘贴的 figure 把任意外链塞进画板节点。 */
export function isMediaUrl(url: string): boolean {
  return /^\/media\/[^\s"'<>]+$/.test(url);
}

/** 从 figure 元素读回画板属性；不是画板或 URL 不合法返回 null。 */
export function readDrawioFigure(el: Element): Required<DrawioBoardAttrs> | null {
  if (!el.hasAttribute('data-jz-drawio')) return null;
  const img = el.querySelector('img');
  const src = img?.getAttribute('src') ?? '';
  const png = el.getAttribute('data-png') ?? '';
  if (src && !isMediaUrl(src)) return null;
  const scheme = el.getAttribute('data-jz-scheme') === 'light' ? 'light' : 'auto';
  const rawSize = el.getAttribute('data-jz-size');
  const size: DrawioSize = rawSize === 's' || rawSize === 'full' ? rawSize : 'auto';
  const rawAlign = el.getAttribute('data-jz-align');
  const align: DrawioAlign = rawAlign === 'left' || rawAlign === 'right' ? rawAlign : 'center';
  const caption = (el.querySelector('figcaption')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return { src, png: png && isMediaUrl(png) ? png : '', scheme, size, align, caption };
}

/**
 * 上传文件名：`drawio画板-YYYYMMDD-HHmmss-xxxx.svg|png`。同一次保存的 SVG/PNG
 * 共用前缀（附件面板据此配对成一条）；后端 `drawio_gc` 按这个前缀认领画板文件。
 */
export function drawioFileStem(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${DRAWIO_BOARD_NAME}-${stamp}-${rand}`;
}

/** 下载文件名：`<文档标题>-画板N.svg`（去掉文件名非法字符）。 */
export function drawioDownloadName(title: string, index: number, total: number): string {
  const safe = (title || DRAWIO_BOARD_NAME).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
  return total > 1 ? `${safe}-画板${index + 1}.svg` : `${safe}-画板.svg`;
}

interface NamedAttachment {
  id: number;
  original_filename: string;
}

export type AttachmentRow<T extends NamedAttachment> =
  | { type: 'drawio'; key: string; svg: T | null; png: T | null }
  | { type: 'file'; key: string; att: T };

const DRAWIO_FILE_RE = /^(drawio画板-[\w-]+|drawio)\.(svg|png)$/;

/** 附件面板：同一次保存的画板 SVG + PNG 合并成一行，其它附件原样。保持原顺序。 */
export function groupAttachmentsForPanel<T extends NamedAttachment>(items: T[]): AttachmentRow<T>[] {
  const rows: AttachmentRow<T>[] = [];
  const byStem = new Map<string, Extract<AttachmentRow<T>, { type: 'drawio' }>>();
  for (const a of items) {
    const m = DRAWIO_FILE_RE.exec(a.original_filename);
    // 底座批次早期的 `drawio.svg/png` 无法可靠配对，按单个画板文件各占一行。
    const stem = m && m[1] !== 'drawio' ? m[1]! : m ? `legacy-${a.id}` : null;
    if (!m || !stem) {
      rows.push({ type: 'file', key: `f-${a.id}`, att: a });
      continue;
    }
    let row = byStem.get(stem);
    if (!row) {
      row = { type: 'drawio', key: `d-${stem}`, svg: null, png: null };
      byStem.set(stem, row);
      rows.push(row);
    }
    if (m[2] === 'svg') row.svg = a;
    else row.png = a;
  }
  return rows;
}

/** export 事件的 data URI → 可上传的 File。 */
export function dataUriToFile(dataUri: string, filename: string): File | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUri);
  if (!m) return null;
  const [, mime, b64, payload] = m;
  try {
    const bytes = b64
      ? Uint8Array.from(atob(payload!), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(payload!));
    return new File([bytes], filename, { type: mime });
  } catch {
    return null;
  }
}
