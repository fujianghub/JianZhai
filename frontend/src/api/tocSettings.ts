/** Site-wide 目录 defaults, one prefs blob per scope — see ``utils/tocPrefs.ts``. */
import { apiClient, ensureCsrf } from './client';
import type { TocPrefs, TocScope, TocSiteDefaults } from '@/utils/tocPrefs';

export interface TocSettingsPublic {
  prefs: TocSiteDefaults;
}

export interface TocSettingsAdmin extends TocSettingsPublic {
  /** Factory defaults per scope (what「恢复出厂」restores). */
  defaults: TocSiteDefaults;
  scopes: TocScope[];
  updated_at: string | null;
}

/** ``{scope: subset}`` for any scopes (others untouched), or a reset of
 * every scope (``true``) / one scope. */
export type TocSettingsPatch = Partial<Record<TocScope, Partial<TocPrefs>>> | { reset: true | TocScope };

/** Reader-facing (login-gated like every /public/* route). */
export async function getPublicTocSettings(): Promise<TocSettingsPublic> {
  const { data } = await apiClient.get<TocSettingsPublic>('/public/toc-settings/');
  return data;
}

export async function getTocSettings(): Promise<TocSettingsAdmin> {
  const { data } = await apiClient.get<TocSettingsAdmin>('/auth/toc/');
  return data;
}

/** Staff-only. */
export async function patchTocSettings(patch: TocSettingsPatch): Promise<TocSettingsAdmin> {
  await ensureCsrf();
  const { data } = await apiClient.patch<TocSettingsAdmin>('/auth/toc/', patch);
  return data;
}
