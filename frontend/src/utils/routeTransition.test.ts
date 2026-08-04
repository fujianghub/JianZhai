// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  READY_TIMEOUT_MS,
  isPlainLeftClick,
  navigateWithTransition,
  signalRouteReady,
} from './routeTransition';

/** happy-dom 没有该 API；经 unknown 绕开 DOM lib 的原生签名以便桩替换 */
const vtDoc = document as unknown as { startViewTransition?: unknown };

const plain = {
  defaultPrevented: false,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  button: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete vtDoc.startViewTransition;
  delete document.documentElement.dataset.motion;
  document.documentElement.classList.remove('jz-vt-route');
});

describe('isPlainLeftClick', () => {
  it('accepts an unmodified left click', () => {
    expect(isPlainLeftClick(plain)).toBe(true);
  });
  it.each([
    ['defaultPrevented', { ...plain, defaultPrevented: true }],
    ['metaKey', { ...plain, metaKey: true }],
    ['ctrlKey', { ...plain, ctrlKey: true }],
    ['shiftKey', { ...plain, shiftKey: true }],
    ['altKey', { ...plain, altKey: true }],
    ['middle button', { ...plain, button: 1 }],
  ])('rejects %s', (_label, e) => {
    expect(isPlainLeftClick(e)).toBe(false);
  });
});

describe('navigateWithTransition', () => {
  it('navigates directly when the API is unavailable', () => {
    const nav = vi.fn();
    navigateWithTransition(nav);
    expect(nav).toHaveBeenCalledOnce();
    expect(document.documentElement.classList.contains('jz-vt-route')).toBe(false);
  });

  it('navigates directly at motion level min without touching the API', () => {
    document.documentElement.dataset.motion = 'min';
    const start = vi.fn();
    vtDoc.startViewTransition = start;
    const nav = vi.fn();
    navigateWithTransition(nav);
    expect(nav).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it('names the shared element, waits for route-ready, then cleans up', async () => {
    let cb: (() => void | Promise<void>) | null = null;
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((r) => {
      finish = r;
    });
    vtDoc.startViewTransition = vi.fn((c: () => void | Promise<void>) => {
      cb = c;
      return { finished };
    });
    const el = document.createElement('div');
    const nav = vi.fn();
    navigateWithTransition(nav, { el, name: 'jz-kb-hero' });
    expect(el.style.getPropertyValue('view-transition-name')).toBe('jz-kb-hero');
    expect(document.documentElement.classList.contains('jz-vt-route')).toBe(true);

    const pending = cb!() as Promise<void>;
    expect(nav).toHaveBeenCalledOnce();
    signalRouteReady();
    await pending;

    finish();
    await finished;
    await new Promise((r) => setTimeout(r, 0));
    expect(el.style.getPropertyValue('view-transition-name')).toBe('');
    expect(document.documentElement.classList.contains('jz-vt-route')).toBe(false);
  });

  it('resolves via timeout when the destination never signals ready', async () => {
    vi.useFakeTimers();
    let cb: (() => void | Promise<void>) | null = null;
    vtDoc.startViewTransition = vi.fn((c: () => void | Promise<void>) => {
      cb = c;
      return { finished: new Promise<void>(() => undefined) };
    });
    navigateWithTransition(vi.fn());
    const pending = cb!() as Promise<void>;
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 1);
    expect(settled).toBe(true);
  });
});
