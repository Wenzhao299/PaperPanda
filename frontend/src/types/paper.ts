export interface PaperSummary {
  id: string;
  arxivId: string;
  title: string;
  summary: string;
  primaryCategory: string;
  publishedDate?: string;
  source?: string;
  hotScore?: number;
  rank?: number;
}

export interface PaperDetail extends PaperSummary {
  abstract: string;
  authors: string[];
}
