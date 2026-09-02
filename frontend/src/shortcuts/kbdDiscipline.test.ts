import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * 快捷键显示纪律（2026-09-02）：
 * 组件里禁止手写 'Ctrl+K' / '⌘K' / 'Ctrl/⌘+S' 这类字符串与裸 <kbd>——一律
 * `formatShortcut(id)` / `withShortcut(label, id)` / `<Kbd id=…>`，否则 Mac 用户
 * 看到 Ctrl、Windows 用户看到 ⌘（体检时约 28 处记法混乱）。
 *
 * ALLOWLIST 曾登记 B4 阶段 12 个存量文件，B5 已全部迁移清空；新违规直接红。
 */
const srcDir = resolve(__dirname, '..');

const ALLOWLIST = new Set<string>([]);

/** 允许出现 <kbd> 的地方：Kbd 组件本身 */
const KBD_ALLOWED = new Set<string>(['components/common/Kbd.tsx']);

const HARDCODED = /(?:Ctrl|⌘|Cmd)\s*(?:\/\s*(?:⌘|Ctrl)\s*)?\+?\s*(?:Shift|Alt)?\s*\+?\s*[A-Z0-9/.,]\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'vendor' || name === 'shortcuts') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('快捷键显示纪律', () => {
  const offenders: string[] = [];
  const stale: string[] = [];
  for (const file of walk(srcDir)) {
    const rel = relative(srcDir, file);
    const src = stripComments(readFileSync(file, 'utf-8'));
    const hard = HARDCODED.test(src);
    const kbd = /<kbd\b/.test(src) && !KBD_ALLOWED.has(rel);
    if ((hard || kbd) && !ALLOWLIST.has(rel)) offenders.push(rel);
    if (!hard && !kbd && ALLOWLIST.has(rel)) stale.push(rel);
  }

  it('允许清单之外无硬编码快捷键字符串 / 裸 <kbd>', () => {
    expect(offenders, `改用 formatShortcut / <Kbd>：${offenders.join(', ')}`).toEqual([]);
  });

  it('允许清单不含已经干净的文件（迁完请从 ALLOWLIST 删除）', () => {
    expect(stale).toEqual([]);
  });
});
