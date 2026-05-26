import { useCallback, useEffect, useState } from 'react';

export type DocLayoutMode = 'edit' | 'split' | 'preview';

const STORAGE_KEY = 'jz-doc-layout';

function readStored(): DocLayoutMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'edit' || v === 'preview' || v === 'split') return v;
  } catch {
    /* noop */
  }
  return 'edit';
}

export function useDocLayoutMode() {
  const [layoutMode, setLayoutModeState] = useState<DocLayoutMode>(readStored);

  const setLayoutMode = useCallback((next: DocLayoutMode) => {
    setLayoutModeState(next);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, layoutMode);
    } catch {
      /* noop */
    }
  }, [layoutMode]);

  return { layoutMode, setLayoutMode };
}
