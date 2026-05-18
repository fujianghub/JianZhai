export type Visibility = 'private' | 'public';
export type DocumentStatus = 'draft' | 'published';
export type DocFormat = 'markdown' | 'html' | 'pdf' | 'docx' | 'image';

export interface PublicTagSummary {
  id: number;
  name: string;
  slug: string;
  color: string;
}

export interface KnowledgeBase {
  id: number;
  name: string;
  slug: string;
  description: string;
  cover_image: string;
  accent_color: string;
  visibility: Visibility;
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
  doc_format: DocFormat;
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
  folders: TreeFolder[];
  documents: TreeDocument[];
}

export interface SessionUser {
  id: number;
  username: string;
  is_staff: boolean;
  is_superuser: boolean;
}

export interface User {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
  is_superuser: boolean;
  is_active: boolean;
  date_joined: string;
  last_login: string | null;
}

export interface SessionResponse {
  authenticated: boolean;
  user: SessionUser | null;
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
