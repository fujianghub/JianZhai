/** Blog read URL for a published post (optional ?kb= disambiguates slug). */
export function postReadHref(slug: string, kbSlug?: string): string {
  const path = `/posts/${encodeURIComponent(slug)}`;
  return kbSlug ? `${path}?kb=${encodeURIComponent(kbSlug)}` : path;
}

export interface DocLinkFields {
  id: number;
  slug: string;
  status: 'draft' | 'published';
  visibility: 'private' | 'public';
  knowledge_base: { slug: string };
}

/** Primary destination: read published public posts; otherwise /d/:id resolver. */
export function docBrowseHref(doc: DocLinkFields): string {
  if (doc.status === 'published' && doc.visibility === 'public') {
    return postReadHref(doc.slug, doc.knowledge_base.slug);
  }
  return `/d/${doc.id}`;
}

export function docEditorHref(kbId: number, docId: number): string {
  return `/admin/kbs/${kbId}?doc=${docId}`;
}
