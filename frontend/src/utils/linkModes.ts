import { getDocumentPreview } from '@/api/docs';
import { getLinkPreview } from '@/api/linkPreview';

/**
 * 语雀式链接三形态（链接/标题/卡片）的共享工具：
 * Tiptap 气泡菜单、CM6 悬浮菜单、链接弹窗、卡片 NodeView 共用同一套
 * href 分类 / 归一化 / 取标题逻辑，避免四处各写一份正则。
 */

export type HrefClass =
  | { kind: 'doc'; id: number }
  | { kind: 'external'; url: string }
  | { kind: 'other'; href: string };

const DOC_PROTO_RE = /^doc:(\d+)$/;
const DOC_PATH_RE = /^\/d\/(\d+)\/?$/;

/**
 * 把任意 href 归类为内部文档 / 外部网页 / 其他（mailto、锚点等）。
 * 站内绝对地址 `${origin}/d/123` 也识别为内部文档，粘贴自己站点的
 * 分享链接时可归一化为 doc:123。
 */
export function classifyHref(href: string, origin?: string): HrefClass {
  const raw = (href ?? '').trim();
  let m = DOC_PROTO_RE.exec(raw);
  if (m) return { kind: 'doc', id: Number(m[1]) };
  m = DOC_PATH_RE.exec(raw);
  if (m) return { kind: 'doc', id: Number(m[1]) };
  if (/^https?:\/\//i.test(raw)) {
    const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
    if (base) {
      try {
        const u = new URL(raw);
        if (u.origin === base) {
          const pm = DOC_PATH_RE.exec(u.pathname);
          if (pm) return { kind: 'doc', id: Number(pm[1]) };
        }
      } catch {
        /* 非法 URL 落到 external 分支之外 */
        return { kind: 'other', href: raw };
      }
    }
    return { kind: 'external', url: raw };
  }
  return { kind: 'other', href: raw };
}

/** 序列化用的规范 href：内部文档统一 doc:ID，外链原样。 */
export function canonicalHref(c: HrefClass): string {
  switch (c.kind) {
    case 'doc':
      return `doc:${c.id}`;
    case 'external':
      return c.url;
    default:
      return c.href;
  }
}

/** 文本是否就是一个裸 URL（链接模式的判定 & 粘贴拦截条件）。 */
export function isBareUrlText(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t || /\s/.test(t)) return false;
  return /^https?:\/\/\S+$/i.test(t) || DOC_PROTO_RE.test(t) || DOC_PATH_RE.test(t);
}

const TITLE_TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('link title fetch timeout')), TITLE_TIMEOUT_MS);
    }),
  ]);
}

/**
 * 取 href 目标的标题：内部文档走 preview 接口（60s 缓存），外链走
 * link-preview OG 接口（5min 缓存）。任何失败/超时/空标题返回 null，
 * 调用方保持 URL 原文即可（默认标题模式的降级路径）。
 */
export async function fetchTitleForHref(href: string, origin?: string): Promise<string | null> {
  const c = classifyHref(href, origin);
  try {
    if (c.kind === 'doc') {
      const preview = await withTimeout(getDocumentPreview(c.id));
      return preview.title?.trim() || null;
    }
    if (c.kind === 'external') {
      const preview = await withTimeout(getLinkPreview(c.url));
      return preview.title?.trim() || null;
    }
  } catch {
    return null;
  }
  return null;
}

/** 「浏览器访问」用的地址：内部文档 → /d/ID（新标签可直达解析器），外链原样。 */
export function browseHref(c: HrefClass): string {
  return c.kind === 'doc' ? `/d/${c.id}` : canonicalHref(c);
}

/** 新标签打开（浏览器访问）。 */
export function openInBrowser(c: HrefClass): void {
  window.open(browseHref(c), '_blank', 'noopener');
}
