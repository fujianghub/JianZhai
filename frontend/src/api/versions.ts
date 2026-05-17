import { apiClient, ensureCsrf } from './client';

export interface VersionSummary {
  id: number;
  document: number;
  message: string;
  word_count: number;
  created_by: number | null;
  created_at: string;
}

export interface VersionDetail extends VersionSummary {
  content: string;
}

export async function listVersions(docId: number): Promise<VersionSummary[]> {
  const { data } = await apiClient.get<VersionSummary[]>(`/documents/${docId}/versions/`);
  return data;
}

export async function createVersion(docId: number, message: string): Promise<VersionDetail> {
  await ensureCsrf();
  const { data } = await apiClient.post<VersionDetail>(`/documents/${docId}/versions/`, {
    message,
  });
  return data;
}

export async function getVersion(docId: number, vid: number): Promise<VersionDetail> {
  const { data } = await apiClient.get<VersionDetail>(`/documents/${docId}/versions/${vid}/`);
  return data;
}

export async function diffVersions(
  docId: number,
  a: number,
  b: number
): Promise<{ a: VersionDetail; b: VersionDetail }> {
  const { data } = await apiClient.get(`/documents/${docId}/versions/diff/`, {
    params: { a, b },
  });
  return data;
}

export async function restoreVersion(docId: number, vid: number): Promise<VersionDetail> {
  await ensureCsrf();
  const { data } = await apiClient.post<VersionDetail>(
    `/documents/${docId}/versions/${vid}/restore/`
  );
  return data;
}
