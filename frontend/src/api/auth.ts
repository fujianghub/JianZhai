import { apiClient, ensureCsrf } from './client';
import type { SessionResponse } from '@/types';

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
