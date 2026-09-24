import { useEffect } from 'react';
import { actionIconSvg } from '@/utils/actionIconSvg';
import { DRAWIO_BOARD_NAME, drawioDownloadName } from '@/utils/drawioEmbed';

/**
 * 阅读端 drawio画板 增强：给正文里每个 `figure.jz-drawio` 挂悬浮操作条
 * （全屏查看 = 触发图片灯箱的双击；下载 SVG = 同源 `<a download>`）。
 *
 * 「selector + bindKey」范式（见 CLAUDE.md「绑 DOM 事件的 hook 勿依赖 containerRef」）：
 * 正文经 dangerouslySetInnerHTML 异步落地，内容变化即重扫。幂等：已挂操作条的 figure 跳过。
 * 操作条是纯图标按钮（无文本节点），不影响划线锚点的全文偏移。
 */
interface Props {
  selector: string;
  bindKey: unknown;
  /** 文档标题：下载文件名 `<标题>-画板N.svg`。 */
  title: string;
}

export default function DrawioBoardEnhancer({ selector, bindKey, title }: Props) {
  useEffect(() => {
    const root = document.querySelector(selector);
    if (!root) return;
    const figures = [...root.querySelectorAll<HTMLElement>('figure.jz-drawio')];
    figures.forEach((fig, index) => {
      if (fig.querySelector(':scope > .jz-drawio-rtools')) return;
      const img = fig.querySelector('img');
      if (!img) return;
      const bar = document.createElement('div');
      bar.className = 'jz-drawio-rtools';

      const full = document.createElement('button');
      full.type = 'button';
      full.setAttribute('aria-label', `全屏查看${DRAWIO_BOARD_NAME}`);
      full.title = '全屏查看';
      full.innerHTML = actionIconSvg('fullscreen');
      full.addEventListener('click', (e) => {
        e.preventDefault();
        img.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      });

      const dl = document.createElement('button');
      dl.type = 'button';
      dl.setAttribute('aria-label', `下载${DRAWIO_BOARD_NAME}为 SVG`);
      dl.title = '下载 SVG';
      dl.innerHTML = actionIconSvg('download');
      dl.addEventListener('click', (e) => {
        e.preventDefault();
        void downloadUrl(img.getAttribute('src') ?? '', drawioDownloadName(title, index, figures.length));
      });

      bar.append(full, dl);
      fig.appendChild(bar);
    });
  }, [selector, bindKey, title]);
  return null;
}

/**
 * 同源附件下载，保证文件名：先 fetch 成 Blob（`/media` 闸门照常鉴权，会话 / 媒体票据
 * cookie 随请求），再用 object URL + `download` 触发。直接 `<a href=/media/… download>`
 * 时 Chromium 会忽略 download 名（实测落成存储 uuid 名）。
 */
export async function downloadUrl(url: string, filename: string): Promise<void> {
  if (!url) return;
  let href = url;
  let revoke = false;
  try {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (r.ok) {
      href = URL.createObjectURL(await r.blob());
      revoke = true;
    }
  } catch {
    /* 退回直链：至少能下载，只是文件名可能是存储名 */
  }
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
}
