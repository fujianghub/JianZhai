/**
 * 后台「知识库管理」列表的纯逻辑（2026-09-25）：筛选 / 排序 / 按大类分组 /
 * 视图偏好持久化。页面组件 `pages/admin/KBListPage.tsx` 只负责渲染。
 *
 * 偏好只在用户显式操作时写入 localStorage（挂载自动回写会把默认值冻结成
 * 「用户选择」，之后改默认对回访者永久失效——见 CLAUDE.md 陷阱区）。
 */
import type { KBCategory, KnowledgeBase } from '@/types';

export type KbViewMode = 'card' | 'list';
export type KbGroupMode = 'category' | 'flat';
export type KbSortKey = 'default' | 'updated' | 'docs' | 'name';
export type KbVisFilter = 'all' | 'public' | 'private';

export const KB_VIEW_KEY = 'jz-admin-kb-view:v1';
export const KB_GROUP_KEY = 'jz-admin-kb-group:v1';
export const KB_SORT_KEY = 'jz-admin-kb-sort:v1';
/** 折叠的分组 key 列表（存折叠而非展开：新建大类默认展开）。 */
export const KB_FOLDS_KEY = 'jz-admin-kb-folds:v1';

export const KB_VIEW_MODES: readonly KbViewMode[] = ['card', 'list'];
export const KB_GROUP_MODES: readonly KbGroupMode[] = ['category', 'flat'];
export const KB_SORT_KEYS: readonly KbSortKey[] = ['default', 'updated', 'docs', 'name'];

export interface KbFilter {
  q: string;
  vis: KbVisFilter;
}

export function isFiltering(f: KbFilter): boolean {
  return f.q.trim() !== '' || f.vis !== 'all';
}

/** 关键词按空白切分、全部命中（AND），匹配名称 / slug / 描述 / 标签 / 大类名，不区分大小写。 */
export function filterKbs(items: KnowledgeBase[], f: KbFilter): KnowledgeBase[] {
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((kb) => {
    if (f.vis !== 'all' && kb.visibility !== f.vis) return false;
    if (!terms.length) return true;
    const hay = [kb.name, kb.slug, kb.description, kb.category?.name ?? '', ...kb.tags.map((t) => t.name)]
      .join('\n')
      .toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

const zhCollator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

/** `default` 保持接口顺序（后端已按 order 排）；其余为稳定排序。 */
export function sortKbs(items: KnowledgeBase[], sort: KbSortKey): KnowledgeBase[] {
  if (sort === 'default') return items.slice();
  const indexed = items.map((kb, i) => ({ kb, i }));
  const cmp = (a: KnowledgeBase, b: KnowledgeBase): number => {
    switch (sort) {
      case 'updated':
        return Date.parse(b.updated_at || '') - Date.parse(a.updated_at || '') || 0;
      case 'docs':
        return b.document_count - a.document_count;
      case 'name':
        return zhCollator.compare(a.name, b.name);
      default:
        return 0;
    }
  };
  indexed.sort((a, b) => cmp(a.kb, b.kb) || a.i - b.i);
  return indexed.map((x) => x.kb);
}

export interface KbSection {
  key: string;
  title: string;
  accent?: string;
  category: KBCategory | null;
  kbs: KnowledgeBase[];
}

export const UNCATEGORIZED_KEY = 'none';

/**
 * 按大类分组，大类顺序跟随 `categories`。`includeEmpty` 时保留空大类（后台
 * 需要看见它存在并可「在此新建」）；筛选中应传 false，只显示有命中的分组。
 * 引用了未知大类（列表尚未刷新）的知识库归入未分类，避免凭空消失。
 */
export function groupKbs(
  items: KnowledgeBase[],
  categories: KBCategory[],
  includeEmpty: boolean,
): KbSection[] {
  const known = new Set(categories.map((c) => c.id));
  const byCat = new Map<number | typeof UNCATEGORIZED_KEY, KnowledgeBase[]>();
  for (const kb of items) {
    const id = kb.category?.id;
    const key = id != null && known.has(id) ? id : UNCATEGORIZED_KEY;
    const list = byCat.get(key);
    if (list) list.push(kb);
    else byCat.set(key, [kb]);
  }
  const sections: KbSection[] = [];
  for (const cat of categories) {
    const kbs = byCat.get(cat.id) ?? [];
    if (kbs.length || includeEmpty) {
      sections.push({ key: `cat-${cat.id}`, title: cat.name, accent: cat.accent_color || undefined, category: cat, kbs });
    }
  }
  const none = byCat.get(UNCATEGORIZED_KEY) ?? [];
  if (none.length) sections.push({ key: UNCATEGORIZED_KEY, title: '未分类', category: null, kbs: none });
  return sections;
}

// ── 偏好持久化 ──

export function loadChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v && (allowed as readonly string[]).includes(v)) return v as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function saveChoice(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function loadFolds(): Set<string> {
  try {
    const raw = localStorage.getItem(KB_FOLDS_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    /* ignore */
  }
  return new Set();
}

export function saveFolds(folds: Set<string>): void {
  saveChoice(KB_FOLDS_KEY, JSON.stringify([...folds]));
}
