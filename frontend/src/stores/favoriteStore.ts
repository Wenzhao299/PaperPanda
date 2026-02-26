import { create } from "zustand";

interface FavoriteState {
  selectedFavoriteId: string | null;
  setSelectedFavoriteId: (favoriteId: string | null) => void;
}

export const useFavoriteStore = create<FavoriteState>((set) => ({
  selectedFavoriteId: null,
  setSelectedFavoriteId: (selectedFavoriteId) => set({ selectedFavoriteId }),
}));
