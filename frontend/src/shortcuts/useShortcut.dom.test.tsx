// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useShortcut } from './useShortcut';

let container: HTMLDivElement;
let root: Root;

function Probe({ id, onHit, capture = false }: { id: string; onHit: (e: KeyboardEvent) => void | boolean; capture?: boolean }) {
  useShortcut(id, onHit, { capture });
  return <textarea data-testid="ta" />;
}

function press(target: EventTarget, init: KeyboardEventInit & { keyCode?: number }) {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  if (init.keyCode) Object.defineProperty(e, 'keyCode', { value: init.keyCode });
  target.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useShortcut', () => {
  it('命中键位时调用 handler 并 preventDefault', () => {
    const hit = vi.fn();
    act(() => root.render(<Probe id="admin.search" onHit={hit} />));
    const e = press(window, { key: 'k', ctrlKey: true });
    expect(hit).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('IME 组合期（keyCode 229）不触发', () => {
    const hit = vi.fn();
    act(() => root.render(<Probe id="admin.search" onHit={hit} />));
    press(window, { key: 'k', ctrlKey: true, keyCode: 229 });
    expect(hit).not.toHaveBeenCalled();
  });

  it('allowInTyping=false 的单键在输入区内不触发，在外触发', () => {
    const hit = vi.fn();
    act(() => root.render(<Probe id="global.cheatsheet-alt" onHit={hit} />));
    const ta = container.querySelector('textarea')!;
    press(ta, { key: '?', shiftKey: true });
    expect(hit).not.toHaveBeenCalled();
    press(document.body, { key: '?', shiftKey: true });
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it('已 defaultPrevented 的事件跳过；handler 返回 false 不 preventDefault', () => {
    const hit = vi.fn(() => false);
    act(() => root.render(<Probe id="admin.search" onHit={hit} />));
    const pre = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
    pre.preventDefault();
    window.dispatchEvent(pre);
    expect(hit).not.toHaveBeenCalled();
    const e = press(window, { key: 'k', ctrlKey: true });
    expect(hit).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(false);
  });

  it('卸载后解绑', () => {
    const hit = vi.fn();
    act(() => root.render(<Probe id="admin.search" onHit={hit} />));
    act(() => root.render(<div />));
    press(window, { key: 'k', ctrlKey: true });
    expect(hit).not.toHaveBeenCalled();
  });
});
