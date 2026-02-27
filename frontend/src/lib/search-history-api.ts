import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import type { PaperViewHistoryRow, SearchHistoryRow } from "@/types/history";

interface Pagination {
  page?: number;
  page_size?: number;
}

function toQuery(params: Pagination): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.page_size) search.set("page_size", String(params.page_size));
  const raw = search.toString();
  return raw ? `?${raw}` : "";
}

export async function listSearchHistory(params: Pagination = {}): Promise<SearchHistoryRow[]> {
  try {
    const response = await apiClient.get<SearchHistoryRow[]>(`/search/history${toQuery(params)}`);
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function listPaperViewHistory(params: Pagination = {}): Promise<PaperViewHistoryRow[]> {
  try {
    const response = await apiClient.get<PaperViewHistoryRow[]>(`/search/history/views${toQuery(params)}`);
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function savePaperView(paperId: string): Promise<PaperViewHistoryRow> {
  try {
    const response = await apiClient.post<PaperViewHistoryRow>("/search/history/views", {
      paper_id: paperId,
    });
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}
