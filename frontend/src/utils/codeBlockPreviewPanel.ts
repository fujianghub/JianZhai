import { message } from '@/utils/notify';
import {
  broadcastPrefsChange,
  FONT_PRESETS,
  INDENT_WIDTHS,
  LINE_HEIGHT_PRESETS,
  loadCodeBlockPrefs,
  saveCodeBlockPrefs,
  applyHideAllTitleBars,
  applyPrefsToBlockElement,
  type CodeBlockPrefs,
} from './codeBlockPrefs';

let openPanel: HTMLElement | null = null;
let openAnchor: HTMLElement | null = null;

function closePanel() {
  openPanel?.remove();
  openPanel = null;
  openAnchor = null;
}

function onDocClick(e: MouseEvent) {
  if (!openPanel) return;
  const t = e.target as Node;
  if (openPanel.contains(t) || openAnchor?.contains(t)) return;
  closePanel();
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', onDocClick);
}

function submenu(label: string, inner: string): string {
  return (
    `<div class="jz-code-settings-submenu">` +
    `<div class="jz-code-settings-item jz-code-settings-submenu-trigger"><span>${label}</span><span class="jz-code-settings-chevron">›</span></div>` +
    `<div class="jz-code-settings-sub">${inner}</div>` +
    `</div>`
  );
}

function switchRow(action: string, label: string, on: boolean): string {
  return (
    `<div class="jz-code-settings-item jz-code-settings-switch-row" data-action="${action}">` +
    `<span>${label}</span>` +
    `<button type="button" class="jz-code-settings-switch${on ? ' is-on' : ''}" role="switch" aria-checked="${on}"></button>` +
    `</div>`
  );
}

function buildPanelHtml(prefs: CodeBlockPrefs): string {
  const fontBtns = FONT_PRESETS.map(
    (s) =>
      `<button type="button" class="jz-code-settings-sub-item${prefs.fontSize === s ? ' is-active' : ''}" data-action="font" data-value="${s}">${s}px</button>`
  ).join('');
  const indentModeBtns = [
    ['tab', 'Tab'],
    ['spaces', '空格'],
  ]
    .map(
      ([mode, label]) =>
        `<button type="button" class="jz-code-settings-sub-item${prefs.indentMode === mode ? ' is-active' : ''}" data-action="indent-mode" data-value="${mode}">${label}</button>`
    )
    .join('');
  const widthBtns = INDENT_WIDTHS.map(
    (w) =>
      `<button type="button" class="jz-code-settings-sub-item${prefs.indentWidth === w ? ' is-active' : ''}" data-action="indent-width" data-value="${w}">${w}</button>`
  ).join('');
  const lineHeightBtns = LINE_HEIGHT_PRESETS.map(
    (lh) =>
      `<button type="button" class="jz-code-settings-sub-item${prefs.lineHeight === lh ? ' is-active' : ''}" data-action="line-height" data-value="${lh}">${lh}</button>`
  ).join('');

  return (
    submenu('字号', fontBtns) +
    submenu('行距', lineHeightBtns) +
    submenu('缩进模式', indentModeBtns) +
    submenu('缩进宽度', widthBtns) +
    `<div class="jz-code-settings-divider"></div>` +
    switchRow('wrap', '自动换行', prefs.wrap) +
    switchRow('line-numbers', '行号', prefs.lineNumbers) +
    `<button type="button" class="jz-code-settings-item jz-code-settings-kbd-row" data-action="auto-indent"><span>自动缩进</span><kbd class="jz-code-settings-kbd">Ctrl+Shift+F</kbd></button>` +
    `<div class="jz-code-settings-divider"></div>` +
    `<button type="button" class="jz-code-settings-item" data-action="sync-style">同步样式到全文</button>` +
    `<button type="button" class="jz-code-settings-item" data-action="sync-hide-titles">${prefs.hideAllTitleBars ? '显示全文代码块标题栏' : '隐藏全文代码块标题栏'}</button>`
  );
}

function wirePanel(
  panel: HTMLElement,
  _prefs: CodeBlockPrefs,
  onChange: (partial: Partial<CodeBlockPrefs>) => void
) {
  panel.querySelectorAll<HTMLElement>('[data-action="font"]').forEach((btn) => {
    btn.addEventListener('click', () => onChange({ fontSize: Number(btn.dataset.value) }));
  });
  panel.querySelectorAll<HTMLElement>('[data-action="indent-mode"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      onChange({ indentMode: btn.dataset.value as CodeBlockPrefs['indentMode'] })
    );
  });
  panel.querySelectorAll<HTMLElement>('[data-action="indent-width"]').forEach((btn) => {
    btn.addEventListener('click', () => onChange({ indentWidth: Number(btn.dataset.value) }));
  });
  panel.querySelectorAll<HTMLElement>('[data-action="line-height"]').forEach((btn) => {
    btn.addEventListener('click', () => onChange({ lineHeight: Number(btn.dataset.value) }));
  });
  panel.querySelector('[data-action="wrap"]')?.addEventListener('click', () =>
    onChange({ wrap: !loadCodeBlockPrefs().wrap })
  );
  panel.querySelector('[data-action="line-numbers"]')?.addEventListener('click', () =>
    onChange({ lineNumbers: !loadCodeBlockPrefs().lineNumbers })
  );
  panel.querySelector('[data-action="auto-indent"]')?.addEventListener('click', () => {
    message.info('预览模式下请使用编辑器进行自动缩进');
  });
  panel.querySelector('[data-action="sync-style"]')?.addEventListener('click', () => {
    broadcastPrefsChange();
    message.success('已同步样式到全文');
    closePanel();
  });
  panel.querySelector('[data-action="sync-hide-titles"]')?.addEventListener('click', () => {
    const next = !loadCodeBlockPrefs().hideAllTitleBars;
    onChange({ hideAllTitleBars: next });
    applyHideAllTitleBars(next);
  });
}

function renderPanel(
  prefs: CodeBlockPrefs,
  onChange: (partial: Partial<CodeBlockPrefs>) => void
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'jz-code-settings-panel';
  panel.innerHTML = buildPanelHtml(prefs);
  wirePanel(panel, prefs, onChange);
  return panel;
}

export function togglePreviewSettingsPanel(anchor: HTMLElement, containerSelector: string) {
  if (openAnchor === anchor) {
    closePanel();
    return;
  }
  closePanel();
  openAnchor = anchor;
  const prefs = loadCodeBlockPrefs();
  const panel = renderPanel(prefs, (partial) => {
    saveCodeBlockPrefs(partial);
    broadcastPrefsChange();
    const next = loadCodeBlockPrefs();
    const root = document.querySelector(containerSelector);
    root?.querySelectorAll<HTMLElement>('.jz-code-block').forEach((b) => applyPrefsToBlockElement(b, next));
    closePanel();
    togglePreviewSettingsPanel(anchor, containerSelector);
  });
  const rect = anchor.getBoundingClientRect();
  panel.style.position = 'fixed';
  panel.style.top = `${rect.bottom + 4}px`;
  panel.style.right = `${window.innerWidth - rect.right}px`;
  panel.style.zIndex = '1050';
  document.body.appendChild(panel);
  openPanel = panel;
}

export function applyPrefsInContainer(containerSelector: string) {
  const root = document.querySelector(containerSelector);
  if (!root) return;
  const prefs = loadCodeBlockPrefs();
  root.querySelectorAll<HTMLElement>('.jz-code-block').forEach((b) => applyPrefsToBlockElement(b, prefs));
}
