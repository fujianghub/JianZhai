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
  /** 摘录日期 ``YYYY-MM-DD`` — 「当时的心境」时间戳，首页展示。用户可在
   *  后台回填/修改；留空表示未记录（此功能上线前的存量题记）。 */
  created_at?: string;
  /** 最近内容修改日期 ``YYYY-MM-DD`` — 服务端在正文/朝代/作者/篇名变更时
   *  盖章，仅后台列表展示。公开端点不返回此字段。 */
  updated_at?: string;
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
