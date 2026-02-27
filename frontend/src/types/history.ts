export interface SearchHistoryRow {
  id: string;
  query: string;
  filters: Record<string, unknown>;
  result_count: number;
  created_at: string;
}

export interface PaperViewHistoryRow {
  id: string;
  paper_id: string;
  arxiv_id: string;
  title: string;
  title_zh: string;
  source: string;
  published_date?: string | null;
  view_count: number;
  viewed_at: string;
}

export interface LocalViewedPaperRecord {
  paper_id: string;
  title: string;
  title_zh: string;
  source: string;
  published_date?: string;
  viewed_at: string;
  view_count: number;
}
