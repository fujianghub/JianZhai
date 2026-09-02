import { useEffect } from 'react';
import { create } from 'zustand';
import type { Scope } from './registry';

/**
 * 快捷键速查表的全局开关 + 当前活动作用域（2026-09-02）。
 * 页面级组件挂载时用 `useActiveScopes([...])` 登记自己的 scope（编辑器 / 阅读页 /
 * 阅读器），卸载自动清空；`GlobalShortcuts` 用 Mod+/ 与 ? 打开时按
 * `global + 路由基 scope + activeScopes` 过滤注册表。
 */
interface CheatSheetState {
  open: boolean;
  scopes: Scope[];
  activeScopes: Scope[];
  openCheatSheet: (scopes?: Scope[]) => void;
  closeCheatSheet: () => void;
  setActiveScopes: (scopes: Scope[]) => void;
}

export const useCheatSheetStore = create<CheatSheetState>((set) => ({
  open: false,
  scopes: ['global'],
  activeScopes: [],
  openCheatSheet(scopes) {
    set((s) => ({ open: true, scopes: scopes ?? s.scopes }));
  },
  closeCheatSheet() {
    set({ open: false });
  },
  setActiveScopes(scopes) {
    set({ activeScopes: scopes });
  },
}));

export function openCheatSheet(scopes?: Scope[]): void {
  useCheatSheetStore.getState().openCheatSheet(scopes);
}

/** 挂载期登记活动作用域（卸载清空）。传入数组按内容比较，避免每次渲染重设。 */
export function useActiveScopes(scopes: readonly Scope[]): void {
  const key = scopes.join(',');
  useEffect(() => {
    const set = useCheatSheetStore.getState().setActiveScopes;
    set(key ? (key.split(',') as Scope[]) : []);
    return () => set([]);
  }, [key]);
}
