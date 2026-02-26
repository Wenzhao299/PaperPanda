import { create } from "zustand";

import type { PaperSummary } from "@/types/paper";

interface SearchState {
  query: string;
  results: PaperSummary[];
  setQuery: (query: string) => void;
  setResults: (results: PaperSummary[]) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: "",
  results: [],
  setQuery: (query) => set({ query }),
  setResults: (results) => set({ results }),
}));
