import { FavoriteList } from "@/components/favorites/FavoriteList";

export default function FavoritesPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 pt-24">
      <h1 className="mb-4 text-3xl font-semibold tracking-tight text-slate-700">收藏夹</h1>
      <FavoriteList />
    </main>
  );
}
