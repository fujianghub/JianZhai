import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * `message` 纪律：组件一律从 `@/utils/notify` 取主题感知的实例，禁止直接
 * `import { message } from 'antd'`（静态 API 读不到 ConfigProvider 主题/locale，
 * 且触发 AntD 控制台告警）。2026-09-02 清掉 7 处残留后由此测试锁定。
 */

const srcDir = resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'vendor' || name === 'node_modules') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe('antd 静态 message 纪律', () => {
  it('src/ 下无 `import { … message … } from \'antd\'`', () => {
    const offenders: string[] = [];
    for (const file of walk(srcDir)) {
      if (file.endsWith('utils/notify.ts')) continue;
      const src = readFileSync(file, 'utf-8');
      for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'antd'/g)) {
        if (/\bmessage\b/.test(m[1])) offenders.push(file.replace(srcDir, 'src'));
      }
    }
    expect(offenders, `改用 @/utils/notify：${offenders.join(', ')}`).toEqual([]);
  });
});
