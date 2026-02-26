import { create } from "zustand";

import { clearAuthTokens, getAccessToken, getUserId, setAuthTokens } from "@/lib/auth";

interface AuthState {
  accessToken: string | null;
  userId: string | null;
  hydrated: boolean;
  hydrate: () => void;
  setAuth: (payload: { accessToken: string; refreshToken: string; userId?: string }) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  userId: null,
  hydrated: false,
  hydrate: () => {
    set({
      accessToken: getAccessToken(),
      userId: getUserId(),
      hydrated: true,
    });
  },
  setAuth: (payload) => {
    setAuthTokens(payload);
    set({ accessToken: payload.accessToken, userId: payload.userId ?? null, hydrated: true });
  },
  clearAuth: () => {
    clearAuthTokens();
    set({ accessToken: null, userId: null, hydrated: true });
  },
}));
