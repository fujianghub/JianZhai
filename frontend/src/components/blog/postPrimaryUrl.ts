import { attachmentAbsoluteUrl } from '@/api/attachments';
import type { PublicPostDetail } from '@/types';

/** Resolve primary attachment URL for HTML legacy hydration.
 *
 * Lives in its own module (split out of PostInlineEditor) so the reader page
 * can call it synchronously without pulling the Tiptap-heavy inline editor
 * into the initial chunk — the editor is now lazy-loaded. */
export function resolvePostPrimaryUrl(post: PublicPostDetail): string | null {
  const att = post.primary_attachment;
  if (!att?.url) return null;
  return attachmentAbsoluteUrl(att.url);
}
