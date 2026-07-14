import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@fr-clone/shared';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  // Zustand's `persist` rehydrates from localStorage asynchronously, so
  // `isAuthenticated` starts `false` on every fresh page load even when a
  // valid session exists. Consumers must wait for `hasHydrated` before
  // treating `isAuthenticated` as authoritative (e.g. before redirecting to
  // /login), otherwise a hard reload or new tab bounces a logged-in user out.
  hasHydrated: boolean;
  setUser: (user: User | null) => void;
  setAccessToken: (token: string | null) => void;
  setHasHydrated: (value: boolean) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      hasHydrated: false,

      setUser: (user) => set({ user }),
      setAccessToken: (token) => set({ accessToken: token }),
      setHasHydrated: (value) => set({ hasHydrated: value }),

      login: (user, token) => set({
        user,
        accessToken: token,
        isAuthenticated: true,
      }),

      logout: () => set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
      }),
    }),
    {
      name: 'auth-storage',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);