import { apiClient, ensureCsrf } from './client';
import type { User } from '@/types';

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export async function listUsers(): Promise<User[]> {
  // DRF default pagination wraps the list in { count, results }, so unwrap.
  // Falls back to treating the body as a plain array in case pagination
  // ever gets disabled for this endpoint.
  const { data } = await apiClient.get<Paginated<User> | User[]>('/auth/users/');
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export interface CreateUserPayload {
  username: string;
  password: string;
  email?: string;
  is_staff?: boolean;
  is_active?: boolean;
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
