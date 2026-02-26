"use client";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function SearchBar({ value, onChange, onSubmit }: SearchBarProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.07)]">
      <input
        className="w-full border-none bg-transparent px-2 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400"
        placeholder="输入任意主题（文本 / arXiv 链接 / arXiv ID）"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onSubmit();
          }
        }}
      />
      <div className="mt-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">arXiv</span>
          <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-600">翻译</span>
        </div>
        <button
          className="h-8 w-8 rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
          onClick={onSubmit}
          type="button"
          aria-label="搜索"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
