"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SearchSource = "arxiv" | "conference" | "journal" | "all";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  source: SearchSource;
  onSourceChange: (value: SearchSource) => void;
  publishedYear: number | null;
  onPublishedYearChange: (value: number | null) => void;
  enableTranslation: boolean;
  onEnableTranslationChange: (value: boolean) => void;
}

interface SourceOption {
  value: SearchSource;
  label: string;
  disabled?: boolean;
}

const SOURCE_OPTIONS: SourceOption[] = [
  { value: "arxiv", label: "arxiv" },
  { value: "conference", label: "会议（占位）", disabled: true },
  { value: "journal", label: "期刊（占位）", disabled: true },
  { value: "all", label: "全部来源" },
];

export function SearchBar({
  value,
  onChange,
  onSubmit,
  source,
  onSourceChange,
  publishedYear,
  onPublishedYearChange,
  enableTranslation,
  onEnableTranslationChange,
}: SearchBarProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!popoverOpen) {
        return;
      }
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setPopoverOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => {
      window.removeEventListener("mousedown", handler);
    };
  }, [popoverOpen]);

  const sourceLabel = useMemo(
    () => SOURCE_OPTIONS.find((item) => item.value === source)?.label ?? "arxiv",
    [source],
  );
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let year = currentYear; year >= 2000; year -= 1) {
      years.push(year);
    }
    return years;
  }, [currentYear]);

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
      ref={rootRef}
    >
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
        <div className="relative flex items-center gap-2">
          <button
            className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
            onClick={() => setPopoverOpen((prev) => !prev)}
            type="button"
          >
            {sourceLabel}
          </button>
          <button
            className={`rounded-full px-2 py-1 text-xs ${
              enableTranslation ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
            }`}
            onClick={() => onEnableTranslationChange(!enableTranslation)}
            type="button"
          >
            翻译
          </button>

          {popoverOpen ? (
            <section className="absolute left-0 top-9 z-30 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-[0_14px_28px_rgba(15,23,42,0.16)]">
              <p className="text-xs font-medium text-slate-500">来源</p>
              <div className="mt-2 space-y-1">
                {SOURCE_OPTIONS.map((option) => (
                  <button
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs ${
                      source === option.value ? "bg-slate-100 text-slate-700" : "text-slate-500 hover:bg-slate-50"
                    } ${option.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                    disabled={option.disabled}
                    key={option.value}
                    onClick={() => {
                      onSourceChange(option.value);
                      setPopoverOpen(false);
                    }}
                    type="button"
                  >
                    <span>{option.label}</span>
                    {option.disabled ? <span>占位</span> : null}
                  </button>
                ))}
              </div>

              <div className="mt-3 border-t border-slate-100 pt-3">
                <label className="text-xs font-medium text-slate-500" htmlFor="published-year">
                  发表年份
                </label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400"
                  id="published-year"
                  onChange={(event) => {
                    const raw = event.target.value;
                    onPublishedYearChange(raw ? Number(raw) : null);
                  }}
                  value={publishedYear ?? ""}
                >
                  <option value="">全部年份</option>
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          ) : null}
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
