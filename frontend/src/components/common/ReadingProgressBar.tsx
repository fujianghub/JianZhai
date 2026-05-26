import { useEffect, useState } from 'react';

/**
 * 顶部细条阅读进度：scrollTop / (scrollHeight - viewportHeight)。
 * 独立文件以避免与 PostDetail 同文件多组件导致 React Fast Refresh 丢失 default export。
 */
export default function ReadingProgressBar() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    function update() {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      if (scrollable <= 0) {
        setPct(0);
        return;
      }
      const p = Math.max(0, Math.min(1, doc.scrollTop / scrollable));
      setPct(p);
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return (
    <div
      className="jz-reading-progress"
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: 3,
        width: `${pct * 100}%`,
        background: 'var(--jz-accent)',
        transition: 'width 100ms linear',
        zIndex: 100,
        pointerEvents: 'none',
      }}
    />
  );
}
