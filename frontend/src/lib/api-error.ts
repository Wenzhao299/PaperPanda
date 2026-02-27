import { AxiosError } from "axios";

interface ApiErrorPayload {
  error?: {
    message?: string;
  };
  detail?: string | Array<{ msg?: string }> | { msg?: string };
}

export function parseApiError(error: unknown, fallback = "Request failed, please retry."): string {
  if (error instanceof AxiosError) {
    const payload = error.response?.data as ApiErrorPayload | undefined;
    if (payload?.error?.message) {
      return payload.error.message;
    }
    if (typeof payload?.detail === "string") {
      return payload.detail;
    }
    if (Array.isArray(payload?.detail) && payload.detail[0]?.msg) {
      return payload.detail[0].msg;
    }
    if (payload?.detail && typeof payload.detail === "object" && "msg" in payload.detail) {
      return payload.detail.msg || fallback;
    }
  }
  return fallback;
}
