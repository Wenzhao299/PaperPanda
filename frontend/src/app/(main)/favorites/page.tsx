import { FavoriteList } from "@/components/favorites/FavoriteList";

export default function FavoritesPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1400px] px-6 pb-12 pt-20">
      <h1 className="mb-5 text-3xl font-semibold tracking-tight text-slate-700">收藏夹</h1>
      <FavoriteList />
    </main>
  );
}
