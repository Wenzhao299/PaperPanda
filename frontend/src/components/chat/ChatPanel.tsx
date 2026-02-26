import { MessageInput } from "@/components/chat/MessageInput";
import { MessageList } from "@/components/chat/MessageList";

export function ChatPanel() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
      <MessageList />
      <MessageInput />
    </section>
  );
}
