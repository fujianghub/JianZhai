import { describe, expect, it, beforeEach } from 'vitest';
import {
  filterSlashCommands,
  getSlashCommands,
  resetSlashCommandsCache,
} from './slashCommandRegistry';

describe('filterSlashCommands', () => {
  beforeEach(() => {
    resetSlashCommandsCache();
  });

  const commands = () => getSlashCommands();

  it('matches dmk alias to 代码块', () => {
    const hits = filterSlashCommands('dmk', commands());
    expect(hits[0]?.id).toBe('code-block');
  });

  it('matches yy alias to 引用块', () => {
    const hits = filterSlashCommands('yy', commands());
    expect(hits[0]?.id).toBe('quote');
  });

  it('matches glk alias to 提示色块', () => {
    const hits = filterSlashCommands('glk', commands());
    expect(hits[0]?.id).toBe('callout-tips');
  });

  it('matches mermaid alias to Mermaid 图表 picker', () => {
    const hits = filterSlashCommands('mermaid', commands());
    expect(hits.some((h) => h.id === 'mermaid-picker')).toBe(true);
  });

  it('matches tp alias to 图片', () => {
    const hits = filterSlashCommands('tp', commands());
    expect(hits[0]?.id).toBe('image');
  });

  it('matches fj alias to 附件', () => {
    const hits = filterSlashCommands('fj', commands());
    expect(hits[0]?.id).toBe('attachment');
  });

  it('matches zdk alias to 折叠块', () => {
    const hits = filterSlashCommands('zdk', commands());
    expect(hits[0]?.id).toBe('details');
  });

  it('matches wbht alias to Mermaid 图表', () => {
    const hits = filterSlashCommands('wbht', commands());
    expect(hits[0]?.id).toBe('mermaid-picker');
  });

  it('matches uml alias to PlantUML', () => {
    const hits = filterSlashCommands('uml', commands());
    expect(hits[0]?.id).toBe('plantuml-sequence');
  });

  it('matches fl alias to 双栏布局', () => {
    const hits = filterSlashCommands('fl', commands());
    expect(hits[0]?.id).toBe('columns-2');
  });

  it('matches emoji alias to 表情', () => {
    const hits = filterSlashCommands('emoji', commands());
    expect(hits[0]?.id).toBe('emoji-trigger');
  });
});
