import { useEffect, useState } from 'react';

/**
 * 顶部细条阅读进度：scrollTop / (scrollHeight - viewportHeight)。
 * 独立文件以避免与 PostDetail 同文件多组件导致 React Fast Refresh 丢失 default export。
 * 外观由 reader.css 的 .jz-reading-progress / .jz-reading-progress-bar 控制
 * (渐变 + 翡翠/朱砂 glow,跟随文档 accent 色)。
 */
export default function ReadingProgressBar() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    let raf = 0;
    function compute() {
      raf = 0;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      if (scrollable <= 0) {
        setPct(0);
        return;
      }
      setPct(Math.max(0, Math.min(1, doc.scrollTop / scrollable)));
    }
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(compute);
    }
    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <>
      <div
        className="jz-reading-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-label="阅读进度"
      >
        <div className="jz-reading-progress-bar" style={{ width: `${pct * 100}%` }} />
      </div>
      {pct > 0.01 && (
        <span className="jz-reading-progress-pct" aria-hidden>
          {Math.round(pct * 100)}%
        </span>
      )}
    </>
  );
}
