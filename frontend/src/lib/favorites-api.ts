import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import type { FavoriteDetail, FavoriteFolder } from "@/types/favorite";

export async function listFavorites(): Promise<FavoriteFolder[]> {
  try {
    const response = await apiClient.get<FavoriteFolder[]>("/favorites");
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function createFavorite(name: string): Promise<FavoriteFolder> {
  try {
    const response = await apiClient.post<FavoriteFolder>("/favorites", { name });
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function updateFavorite(favoriteId: string, name: string): Promise<FavoriteFolder> {
  try {
    const response = await apiClient.put<FavoriteFolder>(`/favorites/${favoriteId}`, { name });
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function deleteFavorite(favoriteId: string): Promise<void> {
  try {
    await apiClient.delete(`/favorites/${favoriteId}`);
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function getFavoriteDetail(favoriteId: string): Promise<FavoriteDetail> {
  try {
    const response = await apiClient.get<FavoriteDetail>(`/favorites/${favoriteId}/detail`);
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function addPaperToFavorite(favoriteId: string, paperId: string): Promise<FavoriteDetail> {
  try {
    const response = await apiClient.post<FavoriteDetail>(`/favorites/${favoriteId}/papers`, {
      paper_id: paperId,
    });
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function removePaperFromFavorite(favoriteId: string, paperId: string): Promise<void> {
  try {
    await apiClient.delete(`/favorites/${favoriteId}/papers/${paperId}`);
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}
