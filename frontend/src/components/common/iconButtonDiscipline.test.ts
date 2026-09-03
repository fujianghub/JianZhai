/**
 * 图标钮纪律（2026-09-03）：组件里禁止再写裸 `<Button type="text" … icon={…} />`
 * （图标-only、无文字子节点）——一律 `<IconButton icon={…} aria-label=… />`，
 * 否则尺寸 / hover / 按下 / focus 四态与圆角令牌各写各的（收编前 62 处）。
 * 编辑器工具栏的 `.jz-toolbar-icon-btn` 是既有成熟范式，豁免。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcDir = resolve(__dirname, '../..');
const ALLOWLIST = new Set<string>([]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'vendor') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

/** Self-closing <Button …/> tags, brace-aware (attrs may hold arrow fns / JSX). */
function selfClosingButtons(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    i = src.indexOf('<Button', i);
    if (i < 0) return out;
    if (!/\s/.test(src[i + 7] ?? '')) {
      i += 7;
      continue;
    }
    let j = i + 7;
    let depth = 0;
    let str: string | null = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (str) {
        if (c === str && src[j - 1] !== '\\') str = null;
      } else if ((c === '"' || c === "'") && depth === 0) str = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (depth === 0 && c === '/' && src[j + 1] === '>') {
        out.push(src.slice(i, j + 2));
        break;
      } else if (depth === 0 && c === '>') break;
    }
    i = j + 1;
  }
}

describe('图标钮纪律', () => {
  const offenders: string[] = [];
  const stale: string[] = [];
  for (const file of walk(srcDir)) {
    const rel = relative(srcDir, file);
    if (rel.endsWith('IconButton.tsx')) continue;
    const bad = selfClosingButtons(readFileSync(file, 'utf8')).filter(
      (t) => /type="text"/.test(t) && /\bicon=/.test(t) && !t.includes('jz-toolbar-icon-btn'),
    );
    if (bad.length && !ALLOWLIST.has(rel)) offenders.push(`${rel} ×${bad.length}`);
    if (!bad.length && ALLOWLIST.has(rel)) stale.push(rel);
  }
  it('无裸 <Button type="text" icon={…} />（用 IconButton）', () => {
    expect(offenders).toEqual([]);
  });
  it('ALLOWLIST 不含已干净文件', () => {
    expect(stale).toEqual([]);
  });
});
