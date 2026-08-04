import { useEffect } from 'react';
import { decorativeMotionEnabled } from '@/utils/motionPref';

/** cards that get the pointer-tracking glass highlight
 * （光感下沉：后台功能卡 2026-08-03 加入；新卡片类型 = 此处 + 对应 ::after） */
const SPOT_SELECTOR = '.jz-book, .ant-card.jz-card, .jz-feature-card';

/**
 * Glass spotlight — one delegated, rAF-throttled mousemove listener that
 * tracks the pointer over any spotlight-enabled card and writes its local
 * coordinates into `--jz-mx/--jz-my`; CSS paints an accent-tinted radial
 * highlight there (see theme.css / book-card.css). Desktop pointers only.
 *
 * Mounted once in App — delegation means zero per-card listeners and it
 * covers cards added later without re-binding.
 */
export default function PointerSpotlight() {
  useEffect(() => {
    if (
      typeof window.matchMedia !== 'function' ||
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches
    ) {
      return;
    }
    let raf = 0;
    let lastEvent: MouseEvent | null = null;
    let lastCard: HTMLElement | null = null;

    function apply() {
      raf = 0;
      const e = lastEvent;
      if (!e) return;
      // 光斑是纯装饰 —— reduced-motion / 动效档位「适中/精简」下不点亮。
      // 在 rAF 回调里裁决而非挂载时：档位运行时可切，无需重挂组件。
      if (!decorativeMotionEnabled()) {
        if (lastCard) lastCard.classList.remove('jz-spot-on');
        lastCard = null;
        return;
      }
      const target = e.target as HTMLElement | null;
      const card =
        target && typeof target.closest === 'function'
          ? (target.closest(SPOT_SELECTOR) as HTMLElement | null)
          : null;
      if (lastCard && lastCard !== card) lastCard.classList.remove('jz-spot-on');
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--jz-mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--jz-my', `${e.clientY - r.top}px`);
        card.classList.add('jz-spot-on');
      }
      lastCard = card;
    }

    function onMove(e: MouseEvent) {
      lastEvent = e;
      if (!raf) raf = requestAnimationFrame(apply);
    }

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
      if (lastCard) lastCard.classList.remove('jz-spot-on');
    };
  }, []);
  return null;
}
