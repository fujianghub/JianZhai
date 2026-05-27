import { create } from 'zustand';
import * as authApi from '@/api/auth';
import { clearPreviewCache } from '@/api/docs';
import type { SessionUser } from '@/types';

interface AuthState {
  user: SessionUser | null;
  loaded: boolean;
  loading: boolean;
  loadSession: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loaded: false,
  loading: false,
  async loadSession() {
    const { loaded, loading } = get();
    if (loaded || loading) return;
    set({ loading: true });
    try {
      const res = await authApi.getSession();
      set({ user: res.user, loaded: true, loading: false });
    } catch {
      set({ user: null, loaded: true, loading: false });
    }
  },
  async login(username, password) {
    set({ loading: true });
    try {
      clearPreviewCache(); // discard any previous user's cached previews
      const res = await authApi.login(username, password);
      set({ user: res.user, loaded: true, loading: false });
    } finally {
      set({ loading: false });
    }
  },
  async logout() {
    try {
      await authApi.logout();
    } finally {
      // Always clear local auth + caches even if the server call fails.
      clearPreviewCache();
      set({ user: null });
    }
  },
}));
