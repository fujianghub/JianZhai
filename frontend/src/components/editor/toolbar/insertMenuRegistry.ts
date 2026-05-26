import type { SlashCommandItem } from '../slashCommandRegistry';
import { getSlashCommands, matchSlashScore, primaryAlias } from '../slashCommandRegistry';

export const INSERT_MENU_SECTIONS = [
  '基础',
  '智能专区',
  '画板类',
  '程序员专区',
  '布局和样式',
  '小工具',
] as const;

export type InsertMenuSection = (typeof INSERT_MENU_SECTIONS)[number];

export interface InsertMenuGrouped {
  section: InsertMenuSection;
  items: SlashCommandItem[];
  grid?: boolean;
}

export function getInsertMenuItems(commands = getSlashCommands()): SlashCommandItem[] {
  return commands
    .filter((c) => c.menuSection && INSERT_MENU_SECTIONS.includes(c.menuSection as InsertMenuSection))
    .sort((a, b) => {
      const sa = INSERT_MENU_SECTIONS.indexOf(a.menuSection as InsertMenuSection);
      const sb = INSERT_MENU_SECTIONS.indexOf(b.menuSection as InsertMenuSection);
      if (sa !== sb) return sa - sb;
      return (a.menuOrder ?? 99) - (b.menuOrder ?? 99);
    });
}

export function groupInsertMenuItems(items: SlashCommandItem[]): InsertMenuGrouped[] {
  const map = new Map<InsertMenuSection, SlashCommandItem[]>();
  for (const item of items) {
    const sec = item.menuSection as InsertMenuSection;
    if (!sec) continue;
    const list = map.get(sec) ?? [];
    list.push(item);
    map.set(sec, list);
  }
  return INSERT_MENU_SECTIONS.filter((s) => map.has(s)).map((section) => {
    const list = map.get(section)!;
    const grid = list.some((i) => i.menuGrid);
    return { section, items: list, grid };
  });
}

export function filterInsertMenu(query: string, commands = getSlashCommands()): InsertMenuGrouped[] {
  const q = query.trim().toLowerCase();
  const base = getInsertMenuItems(commands);
  if (!q) return groupInsertMenuItems(base);
  const filtered = base
    .map((c) => ({ c, score: matchSlashScore(c, q) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ c }) => c);
  return groupInsertMenuItems(filtered);
}

export function insertMenuDisplayTitle(item: SlashCommandItem): string {
  return item.menuTitle ?? item.title;
}

export function insertMenuShortcut(item: SlashCommandItem): string {
  const alias = primaryAlias(item);
  return alias ? `/${alias}` : '';
}

/** Subtitle for list rows — omits alias-only descriptions (shortcut shown on the right). */
export function insertMenuSecondaryDesc(item: SlashCommandItem): string | undefined {
  const shortcut = insertMenuShortcut(item);
  const desc = (item.description ?? '').trim();
  if (!desc) return undefined;
  if (shortcut && (desc === shortcut || desc.startsWith(`${shortcut} `) || desc.startsWith(`${shortcut}·`))) {
    return undefined;
  }
  if (/^\/[\w-]+$/.test(desc)) return undefined;
  const alias = primaryAlias(item);
  if (alias && desc === `/${alias}`) return undefined;
  return desc;
}
