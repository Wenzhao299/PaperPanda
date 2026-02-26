import type { PaperSummary } from "@/types/paper";

interface PaperCardProps {
  paper: PaperSummary;
}

export function PaperCard({ paper }: PaperCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-[0_4px_12px_rgba(15,23,42,0.06)]">
      <h3 className="line-clamp-2 text-base font-semibold text-slate-800">
        {paper.rank ? `${paper.rank}. ` : ""}
        {paper.title}
      </h3>
      <p className="mt-2 text-xs text-slate-500">
        {paper.publishedDate ?? "2026-02-19"} · {paper.source ?? "arxiv"} · 🔥 {paper.hotScore ?? 0}
      </p>
      <p className="mt-3 line-clamp-3 text-sm text-slate-600">{paper.summary}</p>
    </article>
  );
}
