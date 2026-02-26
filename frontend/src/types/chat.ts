export interface ChatSession {
  id: string;
  title: string;
  contextType: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}
