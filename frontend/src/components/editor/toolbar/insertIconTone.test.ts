// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildSlashCommands } from '../slashCommandRegistry';
import { insertIconToneClass } from './insertIconTone';

/**
 * 斜杠菜单每个 item id 都应显式命中 tone 表或前缀规则（2026-09-02 补齐 8 个曾
 * 落回默认 slate 的 id）。默认 slate 只允许「刻意中性」的条目。
 */
const NEUTRAL_ALLOWED = new Set(['hr', 'toc', 'toc-section', 'align-left', 'align-center', 'align-right', 'h1', 'h2', 'h3', 'paragraph']);

describe('insertIconTone 覆盖全部斜杠命令', () => {
  const ids = buildSlashCommands().map((c) => c.id);

  it('有命令可查', () => {
    expect(ids.length).toBeGreaterThan(20);
  });

  it.each(ids)('%s 有显式 tone（或在中性白名单）', (id) => {
    const cls = insertIconToneClass(id);
    expect(cls).toMatch(/^jz-insert-icon--[a-z]+$/);
    if (cls === 'jz-insert-icon--slate') expect(NEUTRAL_ALLOWED.has(id), `${id} 落回默认 slate`).toBe(true);
  });
});
