import { ChatPanel } from "@/components/chat/ChatPanel";

export default function ChatPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 pt-24">
      <h1 className="mb-4 text-3xl font-semibold tracking-tight text-slate-700">AI 对话</h1>
      <ChatPanel />
    </main>
  );
}
