"use client";

import { useEffect } from "react";

import type { PaperDetail } from "@/types/paper";

interface PaperDetailModalProps {
  open: boolean;
  paper: PaperDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}

export function PaperDetailModal({ open, paper, loading, error, onClose }: PaperDetailModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onEscape);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const displayTitle = paper?.titleZh || paper?.title || "论文详情";
  const originalTitle = paper?.title?.trim() || "";
  const showOriginalTitle = Boolean(originalTitle) && originalTitle !== displayTitle;
  const originalAbstract = paper?.abstract || "";
  const translatedAbstract = paper?.abstractZh || paper?.abstract || "";
  const hasBilingualAbstract = Boolean(originalAbstract) && translatedAbstract !== originalAbstract;
  const arxivPage = paper?.arxivId ? `https://arxiv.org/abs/${paper.arxivId.replace(/v\d+$/, "")}` : "";

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 px-4 py-8"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_20px_40px_rgba(15,23,42,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-2xl font-semibold text-slate-800">{displayTitle}</h2>
          <button
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </div>
        {showOriginalTitle ? <p className="mt-1 text-sm text-slate-500">{originalTitle}</p> : null}

        {loading ? <p className="mt-5 text-sm text-slate-500">正在加载论文详情...</p> : null}
        {error ? <p className="mt-5 text-sm text-red-500">{error}</p> : null}

        {!loading && !error && paper ? (
          <div className="mt-5 space-y-4 text-sm text-slate-700">
            <p className="text-slate-500">
              {paper.publishedDate ?? "未知日期"} · {paper.source} · {paper.primaryCategory}
            </p>
            <p>{paper.authors.join(", ") || "作者信息缺失"}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              {paper.arxivId ? <span className="rounded-full bg-slate-100 px-2 py-1">arXiv: {paper.arxivId}</span> : null}
              {paper.categories.map((category) => (
                <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700" key={category}>
                  {category}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              {paper.pdfUrl ? (
                <a
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700"
                  href={paper.pdfUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  PDF
                </a>
              ) : null}
              {arxivPage ? (
                <a
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                  href={arxivPage}
                  rel="noreferrer"
                  target="_blank"
                >
                  论文主页
                </a>
              ) : null}
              {paper.doi ? (
                <a
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                  href={`https://doi.org/${paper.doi}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  DOI: {paper.doi}
                </a>
              ) : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">摘要</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{translatedAbstract}</p>
              {hasBilingualAbstract ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{originalAbstract}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
