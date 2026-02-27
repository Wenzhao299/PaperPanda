import { PaperCard } from "@/components/search/PaperCard";
import type { PaperSummary } from "@/types/paper";

interface SearchResultsProps {
  papers: PaperSummary[];
  showTranslated: boolean;
  onOpenDetail: (paperId: string) => void;
}

export function SearchResults({ papers, showTranslated, onOpenDetail }: SearchResultsProps) {
  return (
    <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {papers.map((paper) => (
        <PaperCard key={paper.id} onOpenDetail={onOpenDetail} paper={paper} showTranslated={showTranslated} />
      ))}
    </section>
  );
}
