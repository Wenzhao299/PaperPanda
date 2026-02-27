export interface FavoriteFolder {
  id: string;
  name: string;
  sort_order: number;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface FavoriteItem {
  paper_id: string;
  arxiv_id: string;
  title: string;
  sort_order: number;
}

export interface FavoriteDetail {
  id: string;
  name: string;
  items: FavoriteItem[];
}
