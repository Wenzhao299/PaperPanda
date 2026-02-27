export interface PaperSummary {
  id: string;
  arxivId: string;
  title: string;
  titleZh: string;
  abstract: string;
  abstractZh: string;
  summary: string;
  authors: string[];
  primaryCategory: string;
  categories: string[];
  publishedDate?: string;
  source: string;
  hotScore?: number;
  rank?: number;
  semanticScore?: number;
  keywordScore?: number;
  llmScore?: number;
  baselineScore?: number;
  rerankScore?: number;
}

export interface PaperDetail extends PaperSummary {
  doi: string;
  pdfUrl: string;
  updatedDate?: string;
  status: string;
}
