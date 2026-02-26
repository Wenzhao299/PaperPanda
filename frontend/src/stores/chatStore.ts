import { create } from "zustand";

import type { ChatMessage } from "@/types/chat";

interface ChatState {
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  setMessages: (messages) => set({ messages }),
}));
