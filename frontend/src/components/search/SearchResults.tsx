import { PaperCard } from "@/components/search/PaperCard";
import type { FavoriteFolder } from "@/types/favorite";
import type { KnowledgeBaseItem } from "@/types/knowledge-base";
import type { PaperSummary } from "@/types/paper";

interface SearchResultsProps {
  papers: PaperSummary[];
  showTranslated: boolean;
  onOpenDetail: (paperId: string) => void;
  viewedPaperIds: string[];
  favoriteFolders: FavoriteFolder[];
  onAddToFavorite: (favoriteId: string, paperId: string) => Promise<void>;
  onCreateFavoriteAndAdd: (name: string, paperId: string) => Promise<void>;
  knowledgeBases: KnowledgeBaseItem[];
  selectedKnowledgeBaseId: string;
  onAddToKnowledgeBase: (knowledgeBaseId: string, paperId: string) => Promise<void>;
  isAuthenticated: boolean;
}

export function SearchResults({
  papers,
  showTranslated,
  onOpenDetail,
  viewedPaperIds,
  favoriteFolders,
  onAddToFavorite,
  onCreateFavoriteAndAdd,
  knowledgeBases,
  selectedKnowledgeBaseId,
  onAddToKnowledgeBase,
  isAuthenticated,
}: SearchResultsProps) {
  return (
    <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {papers.map((paper) => (
        <PaperCard
          key={paper.id}
          favoriteFolders={favoriteFolders}
          isViewed={viewedPaperIds.includes(paper.id)}
          onAddToFavorite={onAddToFavorite}
          onAddToKnowledgeBase={onAddToKnowledgeBase}
          onCreateFavoriteAndAdd={onCreateFavoriteAndAdd}
          isAuthenticated={isAuthenticated}
          onOpenDetail={onOpenDetail}
          paper={paper}
          knowledgeBases={knowledgeBases}
          defaultKnowledgeBaseId={selectedKnowledgeBaseId}
          showTranslated={showTranslated}
        />
      ))}
    </section>
  );
}
