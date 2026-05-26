import { apiClient } from './client';

export interface SystemInfo {
  server_time: string;
  runtime: {
    python: string;
    django: string;
    platform: string;
    debug: boolean;
  };
  /** Effective CSRF/CORS public origin for the running process (superuser debug). */
  security?: {
    csrf_trusted_origins: string[];
    public_origin: string;
  };
  counts: {
    knowledge_bases: number;
    folders: number;
    documents_total: number;
    documents_published: number;
    documents_draft: number;
    documents_public: number;
    documents_updated_24h: number;
    users_total: number;
    users_active: number;
    users_staff: number;
    attachments_total: number;
    attachments_bytes: number;
    documents_html: number;
    ai_calls_24h: number;
  };
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const { data } = await apiClient.get<SystemInfo>('/auth/system-info/');
  return data;
}
