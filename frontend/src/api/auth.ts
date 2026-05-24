import { apiClient, ensureCsrf } from './client';
import type { SessionResponse } from '@/types';

export interface MeProfile {
  id: number;
  username: string;
  email: string;
  avatar_url: string | null;
}

export async function getSession(): Promise<SessionResponse> {
  const { data } = await apiClient.get<SessionResponse>('/auth/session/');
  return data;
}

export async function login(username: string, password: string): Promise<SessionResponse> {
  await ensureCsrf();
  const { data } = await apiClient.post<SessionResponse>('/auth/login/', { username, password });
  return data;
}

export async function logout(): Promise<void> {
  await ensureCsrf();
  await apiClient.post('/auth/logout/');
}

export async function getMe(): Promise<MeProfile> {
  const { data } = await apiClient.get<MeProfile>('/auth/me/');
  return data;
}

export async function uploadAvatar(file: File): Promise<{ avatar_url: string }> {
  await ensureCsrf();
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<{ avatar_url: string }>('/auth/me/avatar/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteAvatar(): Promise<{ avatar_url: null }> {
  await ensureCsrf();
  const { data } = await apiClient.delete<{ avatar_url: null }>('/auth/me/avatar/');
  return data;
}
