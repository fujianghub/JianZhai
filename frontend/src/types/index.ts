export type Visibility = 'private' | 'public';
/** WeChat-Moments-style reader audience for a KB / category. */
export type AudienceMode = 'all' | 'exclude' | 'include';
export type DocumentStatus = 'draft' | 'published';

/** Author-assigned label on a reader account (WeChat-contact style). */
export interface UserTag {
  id: number;
  name: string;
  color: string;
  created_at?: string;
}

/** Brief audience target shapes returned by KB/category read serializers. */
export interface AudienceUserBrief {
  id: number;
  username: string;
}
export interface AudienceTagBrief {
  id: number;
  name: string;
  color: string;
}
export interface AudienceFields {
  audience_mode: AudienceMode;
  audience_users: AudienceUserBrief[];
  audience_tags: AudienceTagBrief[];
}
/** Write shape for KB/category audience (PK lists, not nested objects). */
export interface AudienceWriteFields {
  audience_mode: AudienceMode;
  audience_user_ids: number[];
  audience_tag_ids: number[];
}
export type DocFormat = 'markdown' | 'html' | 'pdf' | 'docx' | 'image';
export type DocSortMode = 'custom' | 'title' | 'created_at' | 'updated_at' | 'doc_format';

export interface KBCategory extends Partial<AudienceFields> {
  id: number;
  name: string;
  slug: string;
  description: string;
  accent_color: string;
  order: number;
  created_at?: string;
  updated_at?: string;
}

export interface PublicKBCategoryGroup {
  category: {
    id: number;
    name: string;
    slug: string;
    description: string;
    accent_color: string;
    order: number;
  } | null;
  knowledge_bases: PublicKB[];
}

export interface PublicTagSummary {
  id: number;
  name: string;
  slug: string;
  color: string;
}

export interface KnowledgeBase extends Partial<AudienceFields> {
  id: number;
  name: string;
  slug: string;
  description: string;
  cover_image: string;
  accent_color: string;
  visibility: Visibility;
  category: KBCategory | null;
  doc_sort_mode: DocSortMode;
  order: number;
  document_count: number;
  tags: PublicTagSummary[];
  created_at: string;
  updated_at: string;
}

export interface PublicKB {
  id: number;
  name: string;
  slug: string;
  description: string;
  cover_image: string;
  accent_color: string;
  category: Pick<KBCategory, 'id' | 'name' | 'slug' | 'order' | 'accent_color'> | null;
  tags: PublicTagSummary[];
  post_count: number;
  updated_at: string;
}

export interface PublicFolder {
  id: number;
  name: string;
  parent: number | null;
  order: number;
  children: PublicFolder[];
  documents: PublicPost[];
  tags: PublicTagSummary[];
}

export interface PublicKBTree {
  id: number;
  name: string;
  slug: string;
  accent_color: string;
  description: string;
  doc_sort_mode?: DocSortMode;
  can_manage?: boolean;
  owner_id?: number;
  tags: PublicTagSummary[];
  /** Flat list of all published+public docs (kept for legacy callers). */
  documents: PublicPost[];
  /** Nested folder hierarchy — folders without published docs are pruned. */
  folders: PublicFolder[];
  /** Documents that live at the KB root (no folder). */
  root_documents: PublicPost[];
}

export interface Folder {
  id: number;
  knowledge_base: number;
  parent: number | null;
  name: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentListItem {
  id: number;
  knowledge_base: number;
  folder: number | null;
  title: string;
  slug: string;
  status: DocumentStatus;
  visibility: Visibility;
  order: number;
  doc_format: DocFormat;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface DocumentDetail extends DocumentListItem {
  raw_content: string;
  published_content: string;
  paper_style: string;
  version: number;
  is_pinned?: boolean;
  primary_attachment: PublicAttachment | null;
}

export interface TreeDocument {
  id: number;
  type: 'document';
  title: string;
  slug: string;
  status: DocumentStatus;
  visibility: Visibility;
  order: number;
  folder: number | null;
  is_pinned: boolean;
  doc_format: DocFormat;
  is_favorited: boolean;
}

export interface TreeFolder {
  id: number;
  type: 'folder';
  name: string;
  parent: number | null;
  order: number;
  children: TreeFolder[];
  documents: TreeDocument[];
  tags: PublicTagSummary[];
}

export interface KBTree {
  id: number;
  name: string;
  doc_sort_mode?: DocSortMode;
  folders: TreeFolder[];
  documents: TreeDocument[];
}

export interface SessionUser {
  id: number;
  username: string;
  /** v0.9.9 — email is now part of every user record. Falsy on legacy
   *  rows that pre-date the requirement. */
  email?: string;
  is_staff: boolean;
  is_superuser: boolean;
  /** v0.9.9 — true iff username === ROOT_ADMIN_USERNAME and is_superuser.
   *  UI uses this to show the 🛡 root badge and hide destructive
   *  buttons targeting the root account. */
  is_root?: boolean;
  /** v1.0 RBAC — single canonical role: anon | user | admin | root.
   *  Menus and route guards gate on this. */
  role?: UserRole;
  is_active?: boolean;
  avatar_url?: string | null;
}

export type UserRole = 'anon' | 'user' | 'admin' | 'root';

export interface User {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_superuser: boolean;
  is_active: boolean;
  is_root?: boolean;
  role?: UserRole;
  /** Author-assigned labels (author-facing only; never sent to readers). */
  tags?: UserTag[];
  date_joined: string;
  last_login: string | null;
}

export interface SessionResponse {
  authenticated: boolean;
  user: SessionUser | null;
  /** v0.9.8 — true when the deployment runs in "friends-only" mode
   *  (SITE_REQUIRE_LOGIN env). Frontend uses this to gate the blog and
   *  redirect anonymous visitors to ``/admin/login``. Optional for
   *  back-compat with old backends. */
  require_login?: boolean;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface PublicPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  published_at: string;
  knowledge_base: { id: number; name: string; slug: string };
  tags: PublicTagSummary[];
  doc_format: DocFormat;
  is_pinned?: boolean;
  is_favorited?: boolean;
}

export interface PublicAttachment {
  id: number;
  url: string;
  original_filename: string;
  mime_type: string;
  size: number;
  kind: string;
}

export interface PublicPostDetail {
  id: number;
  title: string;
  slug: string;
  published_content: string;
  published_at: string;
  updated_at: string;
  knowledge_base: { id: number; name: string; slug: string; accent_color: string };
  tags: PublicTagSummary[];
  paper_style: string;
  primary_attachment: PublicAttachment | null;
  doc_format: DocFormat;
}
