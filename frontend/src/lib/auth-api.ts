import { AxiosError } from "axios";

import { apiClient } from "@/lib/api";
import { clearAuthTokens, setAuthTokens } from "@/lib/auth";
import type {
  ApiErrorPayload,
  AuthResponse,
  LoginRequest,
  ResetPasswordRequest,
  RegisterRequest,
  SendCodeRequest,
} from "@/types/auth";

function parseApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    const payload = error.response?.data as ApiErrorPayload | undefined;
    if (payload?.error?.message) {
      return payload.error.message;
    }

    const detail = payload?.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail) && detail[0]?.msg) {
      return detail[0].msg;
    }
    if (detail && typeof detail === "object" && !Array.isArray(detail) && typeof detail.msg === "string") {
      return detail.msg;
    }
  }
  return "Request failed, please retry.";
}

export async function sendRegisterCode(payload: SendCodeRequest): Promise<void> {
  try {
    await apiClient.post("/auth/send-code", { ...payload, purpose: "register" });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function sendResetCode(payload: SendCodeRequest): Promise<void> {
  try {
    await apiClient.post("/auth/send-code", { ...payload, purpose: "reset_password" });
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function register(payload: RegisterRequest): Promise<AuthResponse> {
  try {
    const response = await apiClient.post<AuthResponse>("/auth/register", payload);
    setAuthTokens({
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      userId: response.data.user_id,
    });
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  try {
    const response = await apiClient.post<AuthResponse>("/auth/login", payload);
    setAuthTokens({
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      userId: response.data.user_id,
    });
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function resetPassword(payload: ResetPasswordRequest): Promise<void> {
  try {
    await apiClient.post("/auth/reset-password", payload);
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post("/auth/logout");
  } catch {
    // ignore API logout failure, local token should still be cleared
  }
  clearAuthTokens();
}
