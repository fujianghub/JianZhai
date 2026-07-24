import { apiClient, ensureCsrf } from './client';
import type { ReadGrantItem, User, UserTag } from '@/types';

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ListUsersParams {
  /** Filter by user-tag id (WeChat-style contact grouping). */
  tag?: number;
  /** Substring match on username or email. */
  search?: string;
}

export async function listUsers(params: ListUsersParams = {}): Promise<User[]> {
  // DRF default pagination wraps the list in { count, results }, so unwrap.
  // Falls back to treating the body as a plain array in case pagination
  // ever gets disabled for this endpoint.
  const { data } = await apiClient.get<Paginated<User> | User[]>('/auth/users/', {
    params,
  });
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export interface CreateUserPayload {
  username: string;
  password: string;
  email?: string;
  is_staff?: boolean;
  is_active?: boolean;
  tag_ids?: number[];
  /** Reading whitelist (full replacement; [] clears, omit = untouched). */
  read_grant_items?: ReadGrantItem[];
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  await ensureCsrf();
  const { data } = await apiClient.post<User>('/auth/users/', payload);
  return data;
}

export interface UpdateUserPayload {
  email?: string;
  password?: string;
  is_staff?: boolean;
  is_active?: boolean;
  tag_ids?: number[];
  /** Reading whitelist (full replacement; [] clears, omit = untouched). */
  read_grant_items?: ReadGrantItem[];
}

export async function updateUser(id: number, payload: UpdateUserPayload): Promise<User> {
  await ensureCsrf();
  const { data } = await apiClient.patch<User>(`/auth/users/${id}/`, payload);
  return data;
}

export async function deleteUser(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/auth/users/${id}/`);
}

// ── User-tag vocabulary (author-managed) ───────────────────────────────────

export async function listUserTags(): Promise<UserTag[]> {
  const { data } = await apiClient.get<Paginated<UserTag> | UserTag[]>('/auth/user-tags/');
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export async function createUserTag(payload: { name: string; color?: string }): Promise<UserTag> {
  await ensureCsrf();
  const { data } = await apiClient.post<UserTag>('/auth/user-tags/', payload);
  return data;
}

export async function updateUserTag(
  id: number,
  payload: { name?: string; color?: string },
): Promise<UserTag> {
  await ensureCsrf();
  const { data } = await apiClient.patch<UserTag>(`/auth/user-tags/${id}/`, payload);
  return data;
}

export async function deleteUserTag(id: number): Promise<void> {
  await ensureCsrf();
  await apiClient.delete(`/auth/user-tags/${id}/`);
}
