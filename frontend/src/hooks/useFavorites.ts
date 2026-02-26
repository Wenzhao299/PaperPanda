"use client";

import { useState } from "react";

export interface FavoriteFolder {
  id: string;
  name: string;
}

export function useFavorites() {
  const [folders, setFolders] = useState<FavoriteFolder[]>([]);

  return {
    folders,
    setFolders,
  };
}
