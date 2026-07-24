// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveClockMode, useThemeStore, type ThemeMode } from './theme';

interface FakeVT {
  finished: Promise<void>;
  skipTransition: ReturnType<typeof vi.fn>;
  resolve: () => void;
}

function installVT(): FakeVT[] {
  const created: FakeVT[] = [];
  (document as unknown as { startViewTransition: (cb: () => void) => unknown }).startViewTransition =
    (cb: () => void) => {
      let resolve!: () => void;
      const finished = new Promise<void>((r) => {
        resolve = r;
      });
      const vt: FakeVT = { finished, skipTransition: vi.fn(), resolve };
      created.push(vt);
      cb();
      return vt;
    };
  return created;
}

function uninstallVT() {
  delete (document as unknown as Record<string, unknown>).startViewTransition;
}

async function settle() {
  // finished 的 catch→finally 链需要两拍微任务
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  document.documentElement.className = '';
  useThemeStore.setState({ mode: 'light', followClock: false, transitionKind: 'switch' });
});

afterEach(() => {
  uninstallVT();
});

describe('theme transitions', () => {
  it('falls back to an instant swap without the View Transition API', () => {
    useThemeStore.getState().setMode('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(useThemeStore.getState().mode).toBe('dark');
    expect(useThemeStore.getState().transitionKind).toBe('switch');
  });

  it('commits the theme inside the transition callback and cleans up after finished', async () => {
    const vts = installVT();
    useThemeStore.getState().setMode('starry');
    expect(vts).toHaveLength(1);
    expect(document.documentElement.dataset.theme).toBe('starry');
    expect(document.documentElement.classList.contains('jz-vt-live')).toBe(true);
    vts[0].resolve();
    await settle();
    expect(document.documentElement.classList.contains('jz-vt-live')).toBe(false);
  });

  it('names the outermost shell layer for the staggered dissolve and releases it', async () => {
    const shell = document.createElement('div');
    shell.className = 'jz-blog-glass ant-layout';
    const inner = document.createElement('div');
    inner.className = 'jz-blog-glass ant-layout';
    shell.appendChild(inner);
    document.body.appendChild(shell);
    const vts = installVT();
    useThemeStore.getState().setMode('dark');
    expect(shell.style.getPropertyValue('view-transition-name')).toBe('jz-shell');
    // 只命名 document 序首个（最外层），嵌套的编辑器壳不重名
    expect(inner.style.getPropertyValue('view-transition-name')).toBe('');
    vts[0].resolve();
    await settle();
    expect(shell.style.getPropertyValue('view-transition-name')).toBe('');
  });

  it('a click origin runs the circular reveal with feathered radius vars', async () => {
    const vts = installVT();
    useThemeStore.getState().setMode('deepsea', { x: 10, y: 20 });
    const root = document.documentElement;
    expect(root.classList.contains('jz-vt-circle')).toBe(true);
    expect(useThemeStore.getState().transitionKind).toBe('reveal');
    const r = parseFloat(root.style.getPropertyValue('--jz-vt-r'));
    const expected =
      Math.ceil(
        Math.hypot(Math.max(10, window.innerWidth - 10), Math.max(20, window.innerHeight - 20)),
      ) + 90;
    expect(r).toBe(expected);
    vts[0].resolve();
    await settle();
    expect(root.classList.contains('jz-vt-circle')).toBe(false);
  });

  it('skips an in-flight transition when a new switch arrives', () => {
    const vts = installVT();
    useThemeStore.getState().setMode('dark');
    useThemeStore.getState().setMode('starry');
    expect(vts).toHaveLength(2);
    expect(vts[0].skipTransition).toHaveBeenCalled();
    expect(vts[1].skipTransition).not.toHaveBeenCalled();
  });

  it('enabling clock-follow across the boundary plays the dusk/dawn veil as a clock transition', () => {
    const target = resolveClockMode(new Date());
    const other: ThemeMode = target === 'light' ? 'starry' : 'light';
    useThemeStore.setState({ mode: other });
    installVT();
    useThemeStore.getState().setFollowClock(true);
    expect(useThemeStore.getState().mode).toBe(target);
    expect(useThemeStore.getState().transitionKind).toBe('clock');
    expect(document.documentElement.classList.contains('jz-vt-clock')).toBe(true);
    const veil = document.querySelector('.jz-dusk-veil');
    expect(veil).not.toBeNull();
    expect(veil!.classList.contains(target === 'light' ? 'jz-veil-dawn' : 'jz-veil-dusk')).toBe(
      true,
    );
  });
});
