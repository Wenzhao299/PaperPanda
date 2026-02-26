const ACCESS_TOKEN_KEY = "paperpanda_access_token";
const REFRESH_TOKEN_KEY = "paperpanda_refresh_token";
const USER_ID_KEY = "paperpanda_user_id";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getAccessToken(): string | null {
  if (!isBrowser()) {
    return null;
  }
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) {
    return null;
  }
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getUserId(): string | null {
  if (!isBrowser()) {
    return null;
  }
  return window.localStorage.getItem(USER_ID_KEY);
}

export function setAuthTokens(payload: {
  accessToken: string;
  refreshToken: string;
  userId?: string;
}): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, payload.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, payload.refreshToken);
  if (payload.userId) {
    window.localStorage.setItem(USER_ID_KEY, payload.userId);
  }
}

export function clearAuthTokens(): void {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_ID_KEY);
}
