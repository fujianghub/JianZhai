import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Popconfirm, Spin } from 'antd';
import { uploadFile } from '@/api/attachments';
import { message } from '@/utils/notify';
import { isLightTheme, useThemeStore } from '@/stores/theme';
import { JzDrawioIcon } from '@/components/common/JzIcon';
import { ICON_SIZE } from '@/components/common/iconSize';
import {
  BLANK_DRAWIO_XML,
  DRAWIO_BOARD_NAME,
  buildDrawioEmbedUrl,
  dataUriToFile,
  drawioFileStem,
  parseDrawioMessage,
  serializeDrawioAction,
  type DrawioAction,
  type DrawioEvent,
} from '@/utils/drawioEmbed';
import { DRAWIO_TEMPLATES, type DrawioTemplate } from '@/utils/drawioTemplates';

/**
 * drawio画板 全屏编辑层。
 *
 * 同源 `/drawio/`（自托管 draw.io，`infra/drawio/`）以普通 iframe 打开（无
 * sandbox：同源编辑器需要自己的存储/剪贴板；代码是钉 tag 的可信 vendor）。
 *
 * 打开方式三种：
 *   - 已有画板（`svgUrl`）：fetch SVG 原文作为 `load.xml`，draw.io 从 `<svg content>` 解析图源；
 *   - 新建（无 svgUrl / 无 mermaid）：先在父页弹「起手模板」面板，draw.io 同时在后台加载；
 *   - Mermaid 转画板（`mermaidSource`）：`load.descriptor = {format:'mermaid'}`，由 draw.io
 *     内置解析器（extensions.min.js 的 @drawio/mermaid）转成可编辑的原生图形。
 *
 * 协议：init → 父页 load（autosave:1，改动发 autosave 用于「未保存」判定）→ load 撤遮罩；
 * save（draw.io 内 Ctrl+S）与父页「保存并退出」同一路径：export xmlsvg（**透明底**——
 * 导出的颜色是 light-dark()，暗色主题下线条/文字自动反色、融入主题底色）+ xmlpng（白底 2×，
 * 仅供 DOCX 导出）→ 两份以同一个 `drawio画板-<时间>-<随机>` 前缀作为本文档附件上传 →
 * `onSaved({src, png})`。被替换掉的旧文件由后端 `drawio_gc` 在正文存盘后回收。
 *
 * 编辑器 UI 按站点主题传 `dark=1/0`（`auto` 只看系统偏好，看不到站点手动主题）。
 * **操作条在父页**：`ui=min` 上游样式把嵌入按钮容器设为 display:none。
 * 所有消息只认 `e.source === iframe.contentWindow`。层级 13000。
 */

export interface DrawioEditorModalProps {
  open: boolean;
  /** 已有画板的 SVG 附件 URL；空 = 新建。 */
  svgUrl?: string;
  /** Mermaid 源码：从代码块转画板时给出（优先于模板选择）。 */
  mermaidSource?: string;
  /** 上传附件归属的文档（新建文档尚无 id 时为空，附件先无主）。 */
  documentId?: number;
  onSaved: (attrs: { src: string; png: string }) => void;
  onClose: () => void;
}

const INIT_TIMEOUT_MS = 45_000;
const EXPORT_TIMEOUT_MS = 30_000;

type Phase = 'choose' | 'loading' | 'ready' | 'saving';
type Source = { xml: string } | { mermaid: string };

async function fetchSvgSource(url: string): Promise<string> {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

export default function DrawioEditorModal({
  open,
  svgUrl,
  mermaidSource,
  documentId,
  onSaved,
  onClose,
}: DrawioEditorModalProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const needsTemplate = !svgUrl && !mermaidSource;
  const [phase, setPhase] = useState<Phase>(needsTemplate ? 'choose' : 'loading');
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const [dirty, setDirty] = useState(false);
  const exportWaiter = useRef<((ev: DrawioEvent) => void) | null>(null);
  const cbRef = useRef({ onSaved, onClose, documentId });
  cbRef.current = { onSaved, onClose, documentId };

  // 站点主题 → draw.io 界面明暗。只在打开时取一次（iframe 不随主题切换重载）。
  const themeMode = useThemeStore((s) => s.mode);
  const embedUrl = useMemo(
    () => buildDrawioEmbedUrl({ dark: !isLightTheme(themeMode) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  // 初始内容：已有画板 / Mermaid 立即可得；新建画板等模板选择（resolver 暴露给选择面板）。
  const source = useRef<Promise<Source> | null>(null);
  const chooseRef = useRef<((s: Source) => void) | null>(null);
  if (open && source.current === null) {
    if (svgUrl) source.current = fetchSvgSource(svgUrl).then((xml) => ({ xml }));
    else if (mermaidSource) source.current = Promise.resolve({ mermaid: mermaidSource });
    else source.current = new Promise<Source>((resolve) => { chooseRef.current = resolve; });
  }
  if (!open && source.current !== null) {
    source.current = null;
    chooseRef.current = null;
  }

  const post = (action: DrawioAction) =>
    frameRef.current?.contentWindow?.postMessage(serializeDrawioAction(action), '*');

  const exportAs = (format: 'xmlsvg' | 'xmlpng') =>
    new Promise<DrawioEvent>((resolve, reject) => {
      const t = window.setTimeout(() => {
        exportWaiter.current = null;
        reject(new Error(`导出 ${format} 超时`));
      }, EXPORT_TIMEOUT_MS);
      exportWaiter.current = (ev) => {
        window.clearTimeout(t);
        exportWaiter.current = null;
        resolve(ev);
      };
      post(
        format === 'xmlsvg'
          ? { action: 'export', format, border: 8 }
          : { action: 'export', format, background: '#ffffff', border: 8, scale: 2 },
      );
    });

  /** 保存并退出（父页按钮与 draw.io 内 Ctrl+S 共用）。经 ref 调用，避免监听器闭包过期。 */
  const saveRef = useRef<() => Promise<void>>(async () => {});
  saveRef.current = async () => {
    if (phaseRef.current !== 'ready') return;
    phaseRef.current = 'saving';
    setPhase('saving');
    post({ action: 'spinner', show: true, message: '正在保存…' });
    try {
      const svgEv = await exportAs('xmlsvg');
      const pngEv = await exportAs('xmlpng');
      const stem = drawioFileStem();
      const svgFile = dataUriToFile(svgEv.data ?? '', `${stem}.svg`);
      if (!svgFile) throw new Error('SVG 导出为空');
      const pngFile = dataUriToFile(pngEv.data ?? '', `${stem}.png`);
      const { documentId: docId } = cbRef.current;
      const [svgAtt, pngAtt] = await Promise.all([
        uploadFile(svgFile, docId),
        pngFile ? uploadFile(pngFile, docId) : Promise.resolve(null),
      ]);
      cbRef.current.onSaved({ src: svgAtt.url, png: pngAtt?.url ?? '' });
      cbRef.current.onClose();
    } catch (err) {
      post({ action: 'spinner', show: false });
      phaseRef.current = 'ready';
      setPhase('ready');
      message.error(`${DRAWIO_BOARD_NAME}保存失败：${(err as Error).message || '未知错误'}`);
    }
  };

  useEffect(() => {
    if (!open) return;
    setPhase(needsTemplate ? 'choose' : 'loading');
    setDirty(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 加载超时只在「已进入加载」后计时（模板选择面板停留多久都不算）。
  useEffect(() => {
    if (!open || phase !== 'loading') return;
    const timer = window.setTimeout(() => {
      if (phaseRef.current === 'loading') {
        message.error(`${DRAWIO_BOARD_NAME}编辑器加载超时，请检查 /drawio/ 是否已部署`);
        cbRef.current.onClose();
      }
    }, INIT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [open, phase]);

  useLayoutEffect(() => {
    if (!open) return;
    function onMessage(e: MessageEvent) {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const ev = parseDrawioMessage(e.data);
      if (!ev) return;
      switch (ev.event) {
        case 'init':
          (source.current ?? Promise.resolve<Source>({ xml: BLANK_DRAWIO_XML }))
            .then((src) =>
              post(
                'mermaid' in src
                  ? { action: 'load', descriptor: { format: 'mermaid', data: src.mermaid }, autosave: 1, title: DRAWIO_BOARD_NAME }
                  : { action: 'load', xml: src.xml, autosave: 1, title: DRAWIO_BOARD_NAME },
              ),
            )
            .catch((err: Error) => {
              message.error(`读取原画板失败：${err.message}`);
              cbRef.current.onClose();
            });
          break;
        case 'load':
          phaseRef.current = 'ready';
          setPhase('ready');
          // Mermaid 转出的图尚未存成画板：退出时要提示「未保存」。
          if (mermaidSource) setDirty(true);
          break;
        case 'autosave':
          setDirty(true);
          break;
        case 'export':
          exportWaiter.current?.(ev);
          break;
        case 'save':
          void saveRef.current();
          break;
        case 'exit':
          if (phaseRef.current !== 'saving') cbRef.current.onClose();
          break;
        default:
          break;
      }
    }
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      exportWaiter.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const pickTemplate = (t: DrawioTemplate) => {
    chooseRef.current?.({ xml: t.xml });
    phaseRef.current = 'loading';
    setPhase('loading');
  };

  const busy = phase !== 'ready';
  const exitButton = (
    <Button className="jz-drawio-exit" aria-label="退出画板" disabled={phase === 'saving'} onClick={dirty ? undefined : onClose}>
      退出
    </Button>
  );

  return createPortal(
    <div ref={overlayRef} className="jz-drawio-overlay" role="dialog" aria-modal="true" aria-label={`${DRAWIO_BOARD_NAME}编辑器`}>
      <iframe ref={frameRef} className="jz-drawio-frame" title={`${DRAWIO_BOARD_NAME}编辑器`} src={embedUrl} />
      {phase !== 'choose' && (
        <div className="jz-drawio-actions">
          {dirty ? (
            <Popconfirm
              title="放弃未保存的修改？"
              okText="放弃"
              cancelText="继续编辑"
              okButtonProps={{ danger: true }}
              onConfirm={onClose}
              getPopupContainer={() => overlayRef.current ?? document.body}
            >
              {exitButton}
            </Popconfirm>
          ) : (
            exitButton
          )}
          <Button
            type="primary"
            className="jz-drawio-save"
            aria-label="保存并退出"
            loading={phase === 'saving'}
            disabled={busy}
            onClick={() => void saveRef.current()}
          >
            保存并退出
          </Button>
        </div>
      )}
      {phase === 'loading' && (
        <div className="jz-drawio-loading">
          <Spin tip={mermaidSource ? '正在把 Mermaid 转成画板…' : `正在打开${DRAWIO_BOARD_NAME}…`} size="large">
            <div style={{ width: 160, height: 80 }} />
          </Spin>
        </div>
      )}
      {phase === 'choose' && (
        <div className="jz-drawio-loading jz-drawio-chooser" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
          <div className="jz-drawio-chooser-card">
            <div className="jz-drawio-chooser-head">
              <JzDrawioIcon size={ICON_SIZE.lg} />
              <span>新建{DRAWIO_BOARD_NAME}</span>
            </div>
            <div className="jz-drawio-chooser-grid">
              {DRAWIO_TEMPLATES.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  className="jz-drawio-template"
                  data-template={t.id}
                  autoFocus={i === 0}
                  onClick={() => pickTemplate(t)}
                >
                  <span className="jz-drawio-template-title">{t.title}</span>
                  <span className="jz-drawio-template-desc">{t.description}</span>
                </button>
              ))}
            </div>
            <div className="jz-drawio-chooser-foot">
              <Button onClick={onClose}>取消</Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
