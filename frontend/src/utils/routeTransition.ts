/**
 * 路由级 View Transition（连续性转场）。
 *
 * 与主题切换的 VT（stores/theme.ts transitionTo）同一 API、不同关切：
 * 这里解决「SPA 导航的 new 快照可能只拍到 Suspense spinner」——
 * startViewTransition 的回调返回一个 Promise，目标页挂载后调
 * signalRouteReady() 才落新快照；READY_TIMEOUT_MS 兜底（懒 chunk 首载
 * 太慢时降级为「向加载态交叉淡化」，绝不冻死页面）。
 *
 * 共享元素约定：源侧只给「被点击的那一个」元素写 inline
 * view-transition-name（主题 VT 的教训：文档里同名两处 = 整场静默跳过），
 * 目标侧由 CSS 依 :root.jz-vt-route 给页面级唯一的标题类打名。
 * 无 API / reduced-motion（含「精简」档）→ 直接导航。
 */
import { prefersReducedMotion } from '@/utils/motionPref';

interface ViewTransitionLike {
  finished: Promise<void>;
  skipTransition?: () => void;
}
type DocWithVT = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => ViewTransitionLike;
};

export const READY_TIMEOUT_MS = 600;

let readyResolve: (() => void) | null = null;

/** 目标页挂载完成（useLayoutEffect）时调用；无路由过渡进行中则为 no-op */
export function signalRouteReady() {
  readyResolve?.();
  readyResolve = null;
}

/** 修饰键/中键/已被处理的点击应交还浏览器默认行为（新标签等），不拦截 */
export function isPlainLeftClick(e: {
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
}): boolean {
  return (
    !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0
  );
}

export interface SharedElementSpec {
  el: HTMLElement | null | undefined;
  name: string;
}

export function navigateWithTransition(doNavigate: () => void, shared?: SharedElementSpec) {
  if (typeof document === 'undefined') {
    doNavigate();
    return;
  }
  const doc = document as DocWithVT;
  if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) {
    doNavigate();
    return;
  }
  const root = document.documentElement;
  const el = shared?.el ?? null;
  if (el && shared) el.style.setProperty('view-transition-name', shared.name);
  root.classList.add('jz-vt-route');
  const vt = doc.startViewTransition(() => {
    doNavigate();
    return new Promise<void>((resolve) => {
      const done = () => {
        if (readyResolve === done) readyResolve = null;
        resolve();
      };
      readyResolve = done;
      window.setTimeout(done, READY_TIMEOUT_MS);
    });
  });
  vt.finished
    .catch(() => undefined)
    .finally(() => {
      if (el) el.style.removeProperty('view-transition-name');
      root.classList.remove('jz-vt-route');
      readyResolve = null;
    });
}
