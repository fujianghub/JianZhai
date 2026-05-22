import { useCallback, useEffect, useState, type RefObject } from 'react';

export type ColumnResizeMode = 'fromLeft' | 'fromRight';

export interface UseColumnResizeOptions {
  storageKey: string;
  min: number;
  max: number;
  defaultWidth: number;
  mode: ColumnResizeMode;
  /** Element whose bounding rect defines the drag coordinate space. */
  containerRef: RefObject<HTMLElement | null>;
}

function readStoredWidth(key: string, min: number, max: number, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    if (Number.isFinite(v) && v >= min && v <= max) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Drag-to-resize a grid column; persists width in localStorage.
 * ``fromLeft``: width = pointer X minus container left (left sidebar).
 * ``fromRight``: width = container right minus pointer X (right sidebar).
 */
export function useColumnResize({
  storageKey,
  min,
  max,
  defaultWidth,
  mode,
  containerRef,
}: UseColumnResizeOptions) {
  const [width, setWidth] = useState(() =>
    readStoredWidth(storageKey, min, max, defaultWidth),
  );
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      /* ignore */
    }
  }, [storageKey, width]);

  const measureWidth = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el) return width;
      const rect = el.getBoundingClientRect();
      const next =
        mode === 'fromLeft' ? clientX - rect.left : rect.right - clientX;
      return clamp(next, min, max);
    },
    [containerRef, mode, min, max, width],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      setWidth(measureWidth(e.clientX));
    };
    const onUp = () => setDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, measureWidth]);

  const onResizerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onResizerDoubleClick = useCallback(() => {
    setWidth(defaultWidth);
  }, [defaultWidth]);

  const onResizerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setWidth((w) => clamp(w - 16, min, max));
      } else if (e.key === 'ArrowRight') {
        setWidth((w) => clamp(w + 16, min, max));
      }
    },
    [min, max],
  );

  return {
    width,
    setWidth,
    dragging,
    onResizerMouseDown,
    onResizerDoubleClick,
    onResizerKeyDown,
  };
}
