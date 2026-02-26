"use client";

import { useState } from "react";

import type { ChatMessage } from "@/types/chat";

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  return {
    messages,
    sending,
    setMessages,
    setSending,
  };
}
