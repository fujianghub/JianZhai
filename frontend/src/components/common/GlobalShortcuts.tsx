import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import ShortcutCheatSheet from './ShortcutCheatSheet';
import { useCheatSheetStore } from '@/shortcuts/cheatSheetStore';
import { useShortcut } from '@/shortcuts/useShortcut';
import type { Scope } from '@/shortcuts/registry';

/**
 * App 级快捷键宿主：Mod+/ 与 ?（输入区外）打开速查表。
 * capture 阶段监听——CM6 defaultKeymap 自带 Mod-/ = toggleComment，Tiptap 的
 * handleKeyDown 也先于 window 冒泡，不抢先会被编辑器吞掉。
 */
export default function GlobalShortcuts() {
  const { pathname } = useLocation();
  const open = useCheatSheetStore((s) => s.open);
  const scopes = useCheatSheetStore((s) => s.scopes);
  const activeScopes = useCheatSheetStore((s) => s.activeScopes);
  const openSheet = useCheatSheetStore((s) => s.openCheatSheet);
  const closeSheet = useCheatSheetStore((s) => s.closeCheatSheet);

  const base: Scope = pathname.startsWith('/admin') ? 'admin' : 'blog';
  const current = useMemo<Scope[]>(() => ['global', base, ...activeScopes], [base, activeScopes]);

  useShortcut('global.cheatsheet', () => openSheet(current), { capture: true });
  useShortcut('global.cheatsheet-alt', () => openSheet(current));

  return <ShortcutCheatSheet open={open} onClose={closeSheet} scopes={open ? scopes : current} />;
}
