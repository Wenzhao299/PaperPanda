"use client";

export function MessageInput() {
  return (
    <div className="flex gap-2">
      <input
        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400"
        placeholder="输入问题..."
      />
      <button className="rounded-lg bg-paper-accent px-4 py-2 text-sm text-white" type="button">
        发送
      </button>
    </div>
  );
}
