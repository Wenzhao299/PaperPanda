export const FAVORITES_UPDATED_EVENT = "paperpanda:favorites-updated";

export function emitFavoritesUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FAVORITES_UPDATED_EVENT));
}
