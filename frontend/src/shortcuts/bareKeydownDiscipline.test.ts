/**
 * 快捷键纪律（2026-09-08）：React 组件里禁止再写裸 `addEventListener('keydown', …)`
 * ——键位一律进 `shortcuts/registry.ts` 并经 `useShortcut` / `matchesChord` 绑定，
 * 才能拿到 IME / contenteditable / defaultPrevented 三道守卫并出现在速查表。
 * 豁免：EpubReader（要把同一 handler 挂到章节 iframe 的 document 上，hook 覆盖
 * 不了 iframe 生命周期）、FullscreenableIframe、GlobalShortcuts、useShortcut 本身、
 * 以及非 React 的 DOM 工具（灯箱 / 图表全屏走 zoomKeymap + registry `owner:'dom'`）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcDir = resolve(__dirname, '..');
const ALLOWLIST = new Set<string>([
  'components/blog/MdAnnotator.tsx',
  'components/common/CodeBlockEnhancer.tsx',
  'components/common/EpubReader.tsx',
  'components/common/FullscreenableIframe.tsx',
  'components/editor/CodeBlockView.tsx',
  'components/editor/FindReplacePanel.tsx',
  'components/editor/ImageNodeView.tsx',
  'components/editor/toolbar/MarkdownQuickInsertMenu.tsx',
  'components/editor/toolbar/QuickInsertMenu.tsx',
  'hooks/useImageLightbox.ts',
  'utils/diagramFullscreen.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'vendor') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

describe('裸 keydown 纪律', () => {
  const offenders: string[] = [];
  const stale: string[] = [];
  for (const file of walk(srcDir)) {
    const rel = relative(srcDir, file);
    if (rel.startsWith('shortcuts/')) continue;
    const src = readFileSync(file, 'utf8');
    const hits = src.match(/addEventListener\(\s*['"]keydown['"]/g)?.length ?? 0;
    if (hits && !ALLOWLIST.has(rel)) offenders.push(`${rel} ×${hits}`);
    if (!hits && ALLOWLIST.has(rel)) stale.push(rel);
  }
  it('阅读器/面板组件不再裸绑 keydown（PdfCanvas / PptxReader 已收编）', () => {
    expect(offenders).toEqual([]);
  });
  it('ALLOWLIST 不含已干净文件', () => {
    expect(stale).toEqual([]);
  });
});
