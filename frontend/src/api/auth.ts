import { apiClient, ensureCsrf } from './client';
import type { SessionResponse, SessionUser } from '@/types';

export type MeProfile = SessionUser;

export async function getSession(): Promise<SessionResponse> {
  const { data } = await apiClient.get<SessionResponse>('/auth/session/');
  return data;
}

export interface CaptchaPuzzle {
  id: string;
  background: string; // data: PNG
  piece: string; // data: PNG
  y: number;
  piece_width: number;
  width: number;
  height: number;
}

export async function getCaptcha(): Promise<CaptchaPuzzle> {
  const { data } = await apiClient.get<CaptchaPuzzle>('/auth/captcha/');
  return data;
}

export async function login(
  username: string,
  password: string,
  email: string,
  captchaId: string,
  captchaX: number,
): Promise<SessionResponse> {
  await ensureCsrf();
  const { data } = await apiClient.post<SessionResponse>('/auth/login/', {
    username,
    password,
    email,
    captcha_id: captchaId,
    captcha_x: captchaX,
  });
  return data;
}

export async function logout(): Promise<void> {
  await ensureCsrf();
  await apiClient.post('/auth/logout/');
}

export async function getMe(): Promise<MeProfile> {
  // v0.9.9 — /me now returns ``{ user: MeProfile }`` to match session/login.
  const { data } = await apiClient.get<{ user: MeProfile }>('/auth/me/');
  return data.user;
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

// ── v0.9.9 self-service credential rotation ─────────────────────────

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await ensureCsrf();
  await apiClient.post('/auth/me/change-password/', {
    old_password: oldPassword,
    new_password: newPassword,
  });
}

export async function changeEmail(email: string, password: string): Promise<SessionUser> {
  await ensureCsrf();
  const { data } = await apiClient.post<SessionUser>('/auth/me/change-email/', {
    email,
    password,
  });
  return data;
}

export async function changeUsername(newUsername: string, password: string): Promise<SessionUser> {
  await ensureCsrf();
  const { data } = await apiClient.post<SessionUser>('/auth/me/change-username/', {
    new_username: newUsername,
    password,
  });
  return data;
}

// ── v0.9.9 admin actions on other users ─────────────────────────────

export async function disableUser(id: number): Promise<SessionUser> {
  await ensureCsrf();
  const { data } = await apiClient.post<SessionUser>(`/auth/users/${id}/disable/`);
  return data;
}

export async function enableUser(id: number): Promise<SessionUser> {
  await ensureCsrf();
  const { data } = await apiClient.post<SessionUser>(`/auth/users/${id}/enable/`);
  return data;
}

export async function resetUserPassword(id: number, newPassword: string): Promise<void> {
  await ensureCsrf();
  await apiClient.post(`/auth/users/${id}/reset-password/`, {
    new_password: newPassword,
  });
}
