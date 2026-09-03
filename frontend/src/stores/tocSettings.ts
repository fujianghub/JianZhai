/**
 * Site 目录 defaults (server) + the ``useTocPrefs`` hook that merges a
 * surface's local overrides on top. Fetched once per page load; a failed
 * fetch (offline, anonymous on a gated site) leaves the code defaults.
 */
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { getPublicTocSettings } from '@/api/tocSettings';
import {
  DEFAULT_TOC_PREFS,
  loadTocOverrides,
  repairTocPrefs,
  saveTocOverrides,
  type TocPrefs,
  type TocScope,
} from '@/utils/tocPrefs';

interface TocSettingsState {
  defaults: TocPrefs;
  status: 'idle' | 'loading' | 'ready' | 'error';
  load: () => void;
  /** Called by the admin page after a successful save so the same session
   * sees the new defaults without a reload. */
  setDefaults: (prefs: TocPrefs) => void;
}

let inflight: Promise<void> | null = null;

export const useTocSettingsStore = create<TocSettingsState>((set, get) => ({
  defaults: DEFAULT_TOC_PREFS,
  status: 'idle',
  load: () => {
    if (get().status !== 'idle' || inflight) return;
    set({ status: 'loading' });
    inflight = getPublicTocSettings()
      .then((res) => set({ defaults: repairTocPrefs(res.prefs), status: 'ready' }))
      .catch(() => set({ status: 'error' }))
      .finally(() => {
        inflight = null;
      });
  },
  setDefaults: (prefs) => set({ defaults: repairTocPrefs(prefs), status: 'ready' }),
}));

export interface TocPrefsApi {
  prefs: TocPrefs;
  /** Site defaults (for「跟随站点设置」comparisons). */
  defaults: TocPrefs;
  update: (patch: Partial<TocPrefs>) => void;
  /** Drop every local override → follow the site defaults again. */
  reset: () => void;
  overridden: boolean;
}

export function useTocPrefs(scope: TocScope): TocPrefsApi {
  const defaults = useTocSettingsStore((s) => s.defaults);
  const load = useTocSettingsStore((s) => s.load);
  useEffect(() => {
    load();
  }, [load]);
  const [overrides, setOverrides] = useState<Partial<TocPrefs>>(() => loadTocOverrides(scope));
  const prefs = useMemo(() => ({ ...defaults, ...overrides }), [defaults, overrides]);
  return useMemo(
    () => ({
      prefs,
      defaults,
      overridden: Object.keys(overrides).length > 0,
      update: (patch) => {
        setOverrides((prev) => {
          const next = { ...prev, ...patch };
          saveTocOverrides(scope, next);
          return next;
        });
      },
      reset: () => {
        setOverrides({});
        saveTocOverrides(scope, {});
      },
    }),
    [prefs, defaults, overrides, scope],
  );
}
