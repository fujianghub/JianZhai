import { useEffect } from 'react';
import { classifyLongImage, IMG_MAX_VH } from '@/utils/longImage';

/**
 * 渲染后长图增强（阅读端 / 预览端），与 TableEnhancer / useImageLightbox 同构的
 * 「selector + bindKey 渲染后扫 DOM」范式——正文经 dangerouslySetInnerHTML 异步
 * 落地，effect 依赖 [selector, bindKey, enabled]，内容变化即重扫。
 *
 * 三段式里 CSS 只能覆盖规则 1/2（max-height 连续缩放）；本增强器负责运行时才可知的
 * 两件事：
 *  - 'capped'：打 `jz-img-capped` 类让缩小后的图居中（纯 CSS 探测不到"是否被钳住"）；
 *  - 'folded'：极端长图（缩到限高后宽度 < 320px）包折叠容器
 *    `span.jz-longimg > (span.jz-longimg-clip > img) + button.jz-longimg-toggle`，
 *    限高裁剪 + 底部渐隐 + 展开/收起。双击图片仍由 lightbox 的容器代理接管（img
 *    还在 DOM 里，事件穿透 wrapper），两者零耦合共存。
 *
 * 幂等：`closest('.jz-longimg')` 防重复包裹，`dataset.jzLimgBound` 防重复挂 load
 * 监听。cleanup 不还原 DOM（bindKey 变化时 innerHTML 整体重设，旧 wrapper 随旧
 * DOM 丢弃，TableEnhancer 同策略）；唯一主动还原路径是 enabled=false（html 不变、
 * DOM 存活，必须显式 unwrap）。
 */

const FOLD_TEXT = '展开长图';
const UNFOLD_TEXT = '收起';

function wrapFolded(img: HTMLImageElement): void {
  const wrapper = document.createElement('span');
  wrapper.className = 'jz-longimg is-collapsed';
  const clip = document.createElement('span');
  clip.className = 'jz-longimg-clip';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'jz-longimg-toggle';
  btn.textContent = FOLD_TEXT;
  btn.setAttribute('aria-expanded', 'false');
  img.replaceWith(wrapper);
  // 折叠图脱离 cap 规则（CSS :not(.jz-longimg-img)），全高由 clip 裁剪
  img.classList.add('jz-longimg-img');
  clip.appendChild(img);
  wrapper.append(clip, btn);
}

function unwrapAll(root: HTMLElement): void {
  root.querySelectorAll('.jz-longimg').forEach((wrapper) => {
    const img = wrapper.querySelector('img');
    if (img) {
      img.classList.remove('jz-longimg-img');
      wrapper.replaceWith(img);
    } else {
      wrapper.remove();
    }
  });
  root.querySelectorAll('img.jz-img-capped').forEach((img) => {
    img.classList.remove('jz-img-capped');
  });
}

export function useLongImageEnhancer(
  selector: string,
  bindKey: unknown,
  enabled = true,
): void {
  useEffect(() => {
    const root = document.querySelector(selector) as HTMLElement | null;
    if (!root) return;

    if (!enabled) {
      // 面板开关关闭：html 未变、DOM 存活，必须显式还原
      unwrapAll(root);
      return;
    }

    const disposers: Array<() => void> = [];

    const classifyOne = (img: HTMLImageElement) => {
      if (!root.contains(img)) return; // lazy load 回调时正文可能已整体重渲
      if (img.closest('.jz-longimg')) return; // 幂等：已包裹
      if (img.closest('a')) return; // 链接图不折叠（与 lightbox 同规则）
      const mode = classifyLongImage({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        containerWidth: (img.parentElement ?? root).clientWidth,
        maxHeightPx: (window.innerHeight * IMG_MAX_VH) / 100,
        hasManualSize: img.hasAttribute('width') || img.hasAttribute('height'),
      });
      img.classList.toggle('jz-img-capped', mode === 'capped');
      if (mode === 'folded') wrapFolded(img);
    };

    // 本轮 effect 已挂 load 监听的图。必须是 effect 局部状态而非 DOM 标记：
    // cleanup 会摘监听，若标记留在 DOM 上（如 dataset），StrictMode 双调 /
    // resize 重扫时会误判"已挂"而跳过重挂 → 图片 load 后永远无人分类。
    const bound = new WeakSet<HTMLImageElement>();

    const apply = () => {
      root.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
        if (img.complete && img.naturalWidth > 0) {
          classifyOne(img);
          return;
        }
        // loading="lazy"：尺寸未知，落地后再分类
        if (bound.has(img)) return;
        bound.add(img);
        const onLoad = () => classifyOne(img);
        img.addEventListener('load', onLoad, { once: true });
        disposers.push(() => img.removeEventListener('load', onLoad));
      });
    };

    // 展开/收起：容器级 click 代理（wrapper 是动态 DOM，代理天然免重绑）
    const onClick = (e: Event) => {
      const btn = (e.target as HTMLElement | null)?.closest?.('.jz-longimg-toggle');
      if (!btn || !root.contains(btn)) return;
      const wrapper = btn.closest('.jz-longimg');
      if (!wrapper) return;
      const collapsed = wrapper.classList.toggle('is-collapsed');
      btn.textContent = collapsed ? FOLD_TEXT : UNFOLD_TEXT;
      btn.setAttribute('aria-expanded', String(!collapsed));
      // 收起后内容骤然变矮，把视口拉回 wrapper，避免停在文外
      if (collapsed) wrapper.scrollIntoView?.({ block: 'nearest' });
    };
    root.addEventListener('click', onClick);

    // 视口变化 → 限高像素与容器宽都变，防抖重分类（仅未包裹图；已折叠保持粘性）
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(apply, 150);
    };
    window.addEventListener('resize', onResize);

    apply();
    return () => {
      root.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
      clearTimeout(resizeTimer);
      disposers.forEach((d) => d());
    };
  }, [selector, bindKey, enabled]);
}

export default function LongImageEnhancer({
  selector,
  bindKey,
  enabled = true,
}: {
  selector: string;
  bindKey: unknown;
  enabled?: boolean;
}) {
  useLongImageEnhancer(selector, bindKey, enabled);
  return null;
}
