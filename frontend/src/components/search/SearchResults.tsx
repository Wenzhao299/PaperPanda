import { PaperCard } from "@/components/search/PaperCard";
import type { PaperSummary } from "@/types/paper";

interface SearchResultsProps {
  papers: PaperSummary[];
}

export function SearchResults({ papers }: SearchResultsProps) {
  return (
    <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {papers.map((paper) => (
        <PaperCard key={paper.id} paper={paper} />
      ))}
    </section>
  );
}
