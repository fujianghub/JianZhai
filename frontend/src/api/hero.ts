import { apiClient, ensureCsrf } from './client';

export interface HeroQuote {
  id: string;
  text: string;
  /** Dynasty / 朝代 — e.g. "三国" / "宋" / "modern". Optional. */
  dynasty: string;
  /** Author / 作者 — e.g. "诸葛亮". */
  author: string;
  /** Source / 篇名 — e.g. "诫子书". */
  source: string;
  /** Legacy ``"〔朝代〕作者 · 篇名"`` derived on the server for back-compat
   *  with v0.9.3 clients. Newer code reads the split fields directly. */
  attribution?: string;
}

export type HeroAnimation = 'fade' | 'slide' | 'typewriter' | 'ink-wash';

/** ``random`` reshuffles per page load; ``sequential`` follows list order. */
export type HeroPlayOrder = 'random' | 'sequential';

export interface HeroPublic {
  enabled: boolean;
  rotation_seconds: number;
  animation: HeroAnimation;
  play_order: HeroPlayOrder;
  quotes: HeroQuote[];
}

export interface HeroSettings extends HeroPublic {
  animations: HeroAnimation[];
  play_orders: HeroPlayOrder[];
  updated_at: string | null;
}

/** Anonymous: feeds the homepage rotator. */
export async function getPublicHero(): Promise<HeroPublic> {
  // Vite proxies ``/api/v1/public/hero/`` to the backend without auth.
  const { data } = await apiClient.get<HeroPublic>('/public/hero/');
  return data;
}

/** Authenticated read of the full settings shape (incl. available animations). */
export async function getHeroSettings(): Promise<HeroSettings> {
  const { data } = await apiClient.get<HeroSettings>('/auth/hero/');
  return data;
}

/** Staff-only write. Accepts any partial of HeroSettings. */
export async function patchHeroSettings(
  patch: Partial<Pick<HeroSettings, 'enabled' | 'rotation_seconds' | 'animation' | 'play_order' | 'quotes'>>,
): Promise<HeroSettings> {
  await ensureCsrf();
  const { data } = await apiClient.patch<HeroSettings>('/auth/hero/', patch);
  return data;
}

/** Staff-only batch import. ``mode`` = "replace" (default) or "append". */
export async function batchImportHero(
  text: string,
  mode: 'replace' | 'append' = 'replace',
): Promise<HeroSettings> {
  await ensureCsrf();
  const { data } = await apiClient.post<HeroSettings>('/auth/hero/batch/', {
    text,
    mode,
  });
  return data;
}
