export interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  settings: Record<string, unknown>;
}
