export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
  detail?: string | { msg?: string } | Array<{ msg?: string }>;
}

export type VerificationPurpose = "register" | "reset_password";

export interface SendCodeRequest {
  email: string;
  purpose?: VerificationPurpose;
}

export interface RegisterRequest {
  email: string;
  password: string;
  code: string;
  nickname?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  new_password: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface AuthResponse extends TokenPair {
  user_id: string;
}
