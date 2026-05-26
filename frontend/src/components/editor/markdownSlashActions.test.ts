import { describe, expect, it } from 'vitest';
import { applyMarkdownSlashCommand, getMarkdownInsertForCommand } from './markdownSlashActions';
import { getSlashCommands } from './slashCommandRegistry';

describe('markdownSlashActions', () => {
  const commands = getSlashCommands();

  it('inserts code fence for dmk command', () => {
    const item = commands.find((c) => c.id === 'code-block')!;
    const insert = getMarkdownInsertForCommand(item);
    expect(insert).toContain('```');
  });

  it('replaces slash query with quote prefix', () => {
    const item = commands.find((c) => c.id === 'quote')!;
    const next = applyMarkdownSlashCommand('hello /yy world', 6, 9, item);
    expect(next).toBe('hello >  world');
  });

  it('replaces slash query with mermaid fence', () => {
    const item = commands.find((c) => c.id === 'mermaid-picker')!;
    const next = applyMarkdownSlashCommand('/mermaid\n', 0, 8, item);
    expect(next).toContain('```mermaid');
    expect(next).toContain('graph TD');
  });
});
