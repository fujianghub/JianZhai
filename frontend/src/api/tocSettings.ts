/** Site-wide 目录 defaults — see ``utils/tocPrefs.ts`` for the shape. */
import { apiClient, ensureCsrf } from './client';
import type { TocPrefs } from '@/utils/tocPrefs';

export interface TocSettingsPublic {
  prefs: TocPrefs;
}

export interface TocSettingsAdmin extends TocSettingsPublic {
  /** Factory defaults (what「恢复出厂」restores). */
  defaults: TocPrefs;
  updated_at: string | null;
}

/** Reader-facing (login-gated like every /public/* route). */
export async function getPublicTocSettings(): Promise<TocSettingsPublic> {
  const { data } = await apiClient.get<TocSettingsPublic>('/public/toc-settings/');
  return data;
}

export async function getTocSettings(): Promise<TocSettingsAdmin> {
  const { data } = await apiClient.get<TocSettingsAdmin>('/auth/toc/');
  return data;
}

/** Staff-only. Any subset of TocPrefs, or ``{reset: true}``. */
export async function patchTocSettings(patch: Partial<TocPrefs> | { reset: true }): Promise<TocSettingsAdmin> {
  await ensureCsrf();
  const { data } = await apiClient.patch<TocSettingsAdmin>('/auth/toc/', patch);
  return data;
}
