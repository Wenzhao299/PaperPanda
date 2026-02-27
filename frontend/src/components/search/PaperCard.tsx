import type { PaperSummary } from "@/types/paper";

interface PaperCardProps {
  paper: PaperSummary;
  showTranslated: boolean;
  onOpenDetail: (paperId: string) => void;
}

export function PaperCard({ paper, showTranslated, onOpenDetail }: PaperCardProps) {
  const translatedTitle = paper.titleZh?.trim() || paper.title;
  const translatedAbstract = paper.abstractZh?.trim() || paper.abstract;
  const title = showTranslated ? translatedTitle : paper.title;
  const content = showTranslated ? translatedAbstract : paper.abstract;

  return (
    <article
      className="cursor-pointer rounded-xl border border-slate-200 bg-white/95 p-4 shadow-[0_4px_12px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.12)]"
      onClick={() => onOpenDetail(paper.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onOpenDetail(paper.id);
        }
      }}
    >
      <h3 className="line-clamp-2 text-base font-semibold text-slate-800">
        {paper.rank ? `${paper.rank}. ` : ""}
        {title}
      </h3>
      <p className="mt-2 text-xs text-slate-500">
        {paper.publishedDate ?? "未知日期"} · {paper.source}
      </p>
      <p className="mt-3 line-clamp-3 text-sm text-slate-600">{content}</p>
      {paper.authors.length > 0 ? (
        <p className="mt-2 line-clamp-1 text-xs text-slate-500">{paper.authors.slice(0, 3).join(", ")}</p>
      ) : null}
    </article>
  );
}
