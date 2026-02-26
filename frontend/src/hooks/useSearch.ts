"use client";

import { useState } from "react";

import type { PaperSummary } from "@/types/paper";

export function useSearch() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PaperSummary[]>([]);

  return {
    loading,
    results,
    setLoading,
    setResults,
  };
}
