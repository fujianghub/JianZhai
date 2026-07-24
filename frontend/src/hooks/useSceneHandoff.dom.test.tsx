// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  SCENE_HANDOFF_MS,
  SCENE_HANDOFF_SLOW_MS,
  useSceneHandoff,
} from './useSceneHandoff';
import type { ThemeMode } from '@/stores/theme';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function Probe({ mode, slow, reduced }: { mode: ThemeMode; slow: boolean; reduced: boolean }) {
  const { current, exiting } = useSceneHandoff(mode, slow, reduced);
  return createElement('div', {
    id: 'probe',
    'data-current': current,
    'data-exiting': exiting ?? 'none',
  });
}

let host: HTMLDivElement;
let root: Root;

function render(mode: ThemeMode, slow = false, reduced = false) {
  act(() => {
    root.render(createElement(Probe, { mode, slow, reduced }));
  });
}

function probe() {
  const el = document.getElementById('probe')!;
  return { current: el.getAttribute('data-current'), exiting: el.getAttribute('data-exiting') };
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe('useSceneHandoff', () => {
  it('starts with the given mode and no exiting scene', () => {
    render('starry');
    expect(probe()).toEqual({ current: 'starry', exiting: 'none' });
  });

  it('keeps the previous scene as exiting, then clears it after the handoff window', () => {
    render('starry');
    render('deepsea');
    expect(probe()).toEqual({ current: 'deepsea', exiting: 'starry' });
    act(() => {
      vi.advanceTimersByTime(SCENE_HANDOFF_MS - 50);
    });
    expect(probe().exiting).toBe('starry');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(probe().exiting).toBe('none');
  });

  it('uses the slow window for clock transitions', () => {
    render('light', true);
    render('starry', true);
    act(() => {
      vi.advanceTimersByTime(SCENE_HANDOFF_MS + 200);
    });
    expect(probe().exiting).toBe('light');
    act(() => {
      vi.advanceTimersByTime(SCENE_HANDOFF_SLOW_MS);
    });
    expect(probe().exiting).toBe('none');
  });

  it('rapid switches always exit the latest previous scene', () => {
    render('starry');
    render('deepsea');
    render('wintersnow');
    expect(probe()).toEqual({ current: 'wintersnow', exiting: 'deepsea' });
    act(() => {
      vi.advanceTimersByTime(SCENE_HANDOFF_MS + 100);
    });
    expect(probe().exiting).toBe('none');
  });

  it('reduced motion swaps instantly without an exiting scene', () => {
    render('starry', false, true);
    render('deepsea', false, true);
    expect(probe()).toEqual({ current: 'deepsea', exiting: 'none' });
  });
});
