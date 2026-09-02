import { useEffect, useRef } from 'react';
import { isImeEvent, isTypingTarget, matchesChord, parseChord } from './keys';
import { getShortcut } from './registry';

export interface UseShortcutOptions {
  enabled?: boolean;
  /** capture 阶段监听——全局键（Mod+/、?）需抢在 CM6 defaultKeymap（自带 Mod-/ toggleComment）与 Tiptap 之前 */
  capture?: boolean;
  target?: Window | Document | HTMLElement | null;
}

export type ShortcutHandler = (e: KeyboardEvent) => void | boolean;

/**
 * 按注册表 id 绑定快捷键。守卫：IME 组合期 / 已被 preventDefault / 注册表
 * `allowInTyping:false` 且焦点在输入区 → 不触发。handler 返回 `false` 表示放行
 * （不 preventDefault，事件继续冒泡）。
 */
export function useShortcut(id: string, handler: ShortcutHandler, opts: UseShortcutOptions = {}): void {
  const { enabled = true, capture = false, target } = opts;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const def = getShortcut(id);
  const chord = def.chord;

  useEffect(() => {
    if (!enabled) return;
    const el: Window | Document | HTMLElement = target ?? window;
    const parsed = parseChord(chord);
    const allowInTyping = def.allowInTyping !== false;
    const listener = (ev: Event) => {
      const e = ev as KeyboardEvent;
      if (e.defaultPrevented || isImeEvent(e)) return;
      if (!allowInTyping && isTypingTarget(e.target)) return;
      if (!matchesChord(e, parsed)) return;
      const r = handlerRef.current(e);
      if (r !== false) e.preventDefault();
    };
    el.addEventListener('keydown', listener, capture);
    return () => el.removeEventListener('keydown', listener, capture);
  }, [enabled, capture, target, chord, def.allowInTyping]);
}
