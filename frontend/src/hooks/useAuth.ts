"use client";

import { useEffect } from "react";

import {
  login as loginApi,
  logout as logoutApi,
  register as registerApi,
  resetPassword as resetPasswordApi,
  sendRegisterCode,
  sendResetCode,
} from "@/lib/auth-api";
import { useAuthStore } from "@/stores/authStore";
import type { LoginRequest, RegisterRequest, ResetPasswordRequest } from "@/types/auth";

export function useAuth() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const hydrated = useAuthStore((state) => state.hydrated);
  const hydrate = useAuthStore((state) => state.hydrate);
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  useEffect(() => {
    if (!hydrated) {
      hydrate();
    }
  }, [hydrated, hydrate]);

  const sendCode = async (email: string): Promise<void> => {
    await sendRegisterCode({ email, purpose: "register" });
  };

  const sendRecoverCode = async (email: string): Promise<void> => {
    await sendResetCode({ email, purpose: "reset_password" });
  };

  const register = async (payload: RegisterRequest): Promise<void> => {
    const auth = await registerApi(payload);
    setAuth({
      accessToken: auth.access_token,
      refreshToken: auth.refresh_token,
      userId: auth.user_id,
    });
  };

  const login = async (payload: LoginRequest): Promise<void> => {
    const auth = await loginApi(payload);
    setAuth({
      accessToken: auth.access_token,
      refreshToken: auth.refresh_token,
      userId: auth.user_id,
    });
  };

  const resetPassword = async (payload: ResetPasswordRequest): Promise<void> => {
    await resetPasswordApi(payload);
  };

  const logout = async (): Promise<void> => {
    await logoutApi();
    clearAuth();
  };

  return {
    accessToken,
    hydrated,
    isAuthenticated: Boolean(accessToken),
    sendCode,
    sendRecoverCode,
    register,
    login,
    resetPassword,
    logout,
  };
}
