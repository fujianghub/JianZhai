import { create } from 'zustand';
import * as authApi from '@/api/auth';
import type { SessionUser } from '@/types';

interface AuthState {
  user: SessionUser | null;
  loaded: boolean;
  loading: boolean;
  loadSession: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loaded: false,
  loading: false,
  async loadSession() {
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
      const res = await authApi.login(username, password);
      set({ user: res.user, loaded: true, loading: false });
    } finally {
      set({ loading: false });
    }
  },
  async logout() {
    await authApi.logout();
    set({ user: null });
  },
}));
