import { apiClient } from './client';

export interface SystemInfo {
  server_time: string;
  runtime: {
    python: string;
    django: string;
    platform: string;
    debug: boolean;
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
  };
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const { data } = await apiClient.get<SystemInfo>('/auth/system-info/');
  return data;
}
