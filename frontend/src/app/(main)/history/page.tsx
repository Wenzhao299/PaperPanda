"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PaperDetailModal } from "@/components/search/PaperDetailModal";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api";
import { addPaperToFavorite, createFavorite, listFavorites } from "@/lib/favorites-api";
import { emitFavoritesUpdated } from "@/lib/favorites-sync";
import { addPaperToKnowledgeBase, listKnowledgeBases } from "@/lib/knowledge-base-api";
import { formatPaperSource } from "@/lib/paperSource";
import { listPaperViewHistory, savePaperView } from "@/lib/search-history-api";
import { clearLocalViewedHistory, listLocalViewedHistory, recordLocalPaperView } from "@/lib/view-history";
import type { LocalViewedPaperRecord, PaperViewHistoryRow } from "@/types/history";
import type { FavoriteFolder } from "@/types/favorite";
import type { KnowledgeBaseItem } from "@/types/knowledge-base";
import type { PaperDetail } from "@/types/paper";

interface PaperDetailApi {
  id: string;
  arxiv_id: string;
  title: string;
  title_zh: string;
  abstract: string;
  abstract_zh: string;
  summary: string;
  authors: string[];
  categories: string[];
  primary_category: string;
  doi: string;
  pdf_url: string;
  source: string;
  status: string;
  published_date: string | null;
  updated_date: string | null;
}

interface ViewHistoryItem {
  paper_id: string;
  title: string;
  title_zh: string;
  source: string;
  published_date?: string;
  viewed_at: string;
  view_count: number;
}

function toPaperDetail(item: PaperDetailApi): PaperDetail {
  return {
    id: item.id,
    arxivId: item.arxiv_id,
    title: item.title,
    titleZh: item.title_zh,
    abstract: item.abstract,
    abstractZh: item.abstract_zh,
    summary: item.summary,
    authors: item.authors || [],
    primaryCategory: item.primary_category,
    categories: item.categories || [],
    source: item.source,
    publishedDate: item.published_date ?? undefined,
    doi: item.doi,
    pdfUrl: item.pdf_url,
    updatedDate: item.updated_date ?? undefined,
    status: item.status,
  };
}

function parseTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function dateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知日期";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchPaperDetailMap(ids: string[]): Promise<Record<string, PaperDetailApi>> {
  const map: Record<string, PaperDetailApi> = {};
  const batchSize = 8;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const rows = await Promise.all(
      batch.map(async (id) => {
        try {
          const response = await apiClient.get<PaperDetailApi>(`/papers/${id}`);
          return response.data;
        } catch {
          return null;
        }
      }),
    );
    rows.forEach((row) => {
      if (row) {
        map[row.id] = row;
      }
    });
  }

  return map;
}

export default function HistoryPage() {
  const { hydrated, isAuthenticated } = useAuth();
  const [viewHistory, setViewHistory] = useState<PaperViewHistoryRow[]>([]);
  const [localViewHistory, setLocalViewHistory] = useState<LocalViewedPaperRecord[]>([]);
  const [favoriteFolders, setFavoriteFolders] = useState<FavoriteFolder[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([]);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [enableTranslation, setEnableTranslation] = useState(false);
  const [translationRefreshing, setTranslationRefreshing] = useState(false);
  const [paperDetailMap, setPaperDetailMap] = useState<Record<string, PaperDetailApi>>({});

  const [detailPaperId, setDetailPaperId] = useState<string | null>(null);
  const [detailPaper, setDetailPaper] = useState<PaperDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    setLocalViewHistory(listLocalViewedHistory());
  }, []);

  useEffect(() => {
    if (!hydrated || !isAuthenticated) {
      setViewHistory([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");

    listPaperViewHistory({ page: 1, page_size: 100 })
      .then((views) => {
        if (cancelled) return;
        setViewHistory(views);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "加载浏览历史失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, isAuthenticated]);

  const refreshFavoriteFolders = useCallback(async () => {
    if (!isAuthenticated) {
      setFavoriteFolders([]);
      return;
    }
    try {
      const rows = await listFavorites();
      setFavoriteFolders(rows);
    } catch {
      setFavoriteFolders([]);
    }
  }, [isAuthenticated]);

  const refreshKnowledgeBases = useCallback(async () => {
    if (!isAuthenticated) {
      setKnowledgeBases([]);
      setSelectedKnowledgeBaseId("");
      return;
    }
    try {
      const rows = await listKnowledgeBases();
      setKnowledgeBases(rows);
      if (rows.length === 0) {
        setSelectedKnowledgeBaseId("");
      } else if (!rows.some((item) => item.id === selectedKnowledgeBaseId)) {
        setSelectedKnowledgeBaseId(rows[0].id);
      }
    } catch {
      setKnowledgeBases([]);
      setSelectedKnowledgeBaseId("");
    }
  }, [isAuthenticated, selectedKnowledgeBaseId]);

  useEffect(() => {
    if (!hydrated || !isAuthenticated) {
      setFavoriteFolders([]);
      setKnowledgeBases([]);
      setSelectedKnowledgeBaseId("");
      return;
    }
    void refreshFavoriteFolders();
    void refreshKnowledgeBases();
  }, [hydrated, isAuthenticated, refreshFavoriteFolders, refreshKnowledgeBases]);

  const mergedViews = useMemo<ViewHistoryItem[]>(() => {
    const rows: ViewHistoryItem[] =
      isAuthenticated && viewHistory.length > 0
        ? viewHistory.map((item) => ({
            paper_id: item.paper_id,
            title: item.title,
            title_zh: item.title_zh,
            source: item.source,
            published_date: item.published_date ?? undefined,
            viewed_at: item.viewed_at,
            view_count: item.view_count,
          }))
        : localViewHistory.map((item) => ({
            paper_id: item.paper_id,
            title: item.title,
            title_zh: item.title_zh,
            source: item.source,
            published_date: item.published_date,
            viewed_at: item.viewed_at,
            view_count: item.view_count,
          }));
    return rows.sort((a, b) => parseTime(b.viewed_at) - parseTime(a.viewed_at));
  }, [isAuthenticated, viewHistory, localViewHistory]);

  const groupedViews = useMemo(() => {
    const groups = new Map<string, ViewHistoryItem[]>();
    for (const item of mergedViews) {
      const key = dateKey(item.viewed_at);
      const existed = groups.get(key);
      if (existed) {
        existed.push(item);
      } else {
        groups.set(key, [item]);
      }
    }
    return Array.from(groups.entries()).map(([day, items]) => ({ day, items }));
  }, [mergedViews]);

  useEffect(() => {
    if (!enableTranslation) {
      setTranslationRefreshing(false);
      return;
    }
    const ids = Array.from(new Set(mergedViews.map((item) => item.paper_id).filter(Boolean)));
    if (ids.length === 0) {
      setPaperDetailMap({});
      return;
    }
    let cancelled = false;
    setTranslationRefreshing(true);

    fetchPaperDetailMap(ids)
      .then((map) => {
        if (cancelled) return;
        setPaperDetailMap(map);
      })
      .finally(() => {
        if (!cancelled) setTranslationRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enableTranslation, mergedViews]);

  const openDetail = useCallback(
    (item: ViewHistoryItem) => {
      recordLocalPaperView({
        paper_id: item.paper_id,
        title: item.title,
        title_zh: item.title_zh,
        source: item.source,
        published_date: item.published_date,
      });
      if (!isAuthenticated) {
        setLocalViewHistory(listLocalViewedHistory());
      } else {
        void savePaperView(item.paper_id).catch(() => undefined);
      }
      setDetailPaperId(item.paper_id);
    },
    [isAuthenticated],
  );

  const handleAddFavorite = useCallback(
    async (favoriteId: string, paperId: string) => {
      if (!isAuthenticated) {
        setError("请先登录后收藏");
        return;
      }
      setError("");
      try {
        await addPaperToFavorite(favoriteId, paperId);
        setNotice("已加入收藏夹");
        await refreshFavoriteFolders();
        emitFavoritesUpdated();
      } catch (e) {
        setError(e instanceof Error ? e.message : "收藏失败");
      }
    },
    [isAuthenticated, refreshFavoriteFolders],
  );

  const handleCreateFavoriteAndAdd = useCallback(
    async (name: string, paperId: string) => {
      if (!isAuthenticated) {
        setError("请先登录后收藏");
        return;
      }
      setError("");
      try {
        const created = await createFavorite(name);
        await addPaperToFavorite(created.id, paperId);
        setNotice("已创建收藏夹并加入论文");
        await refreshFavoriteFolders();
        emitFavoritesUpdated();
      } catch (e) {
        setError(e instanceof Error ? e.message : "创建收藏夹失败");
      }
    },
    [isAuthenticated, refreshFavoriteFolders],
  );

  const handleAddToKnowledgeBase = useCallback(
    async (knowledgeBaseId: string, paperId: string) => {
      if (!isAuthenticated) {
        setError("请先登录后再入库");
        return;
      }
      if (!knowledgeBaseId) {
        setError("请先选择目标知识库");
        return;
      }
      setError("");
      try {
        await addPaperToKnowledgeBase(knowledgeBaseId, paperId);
        setNotice("论文已加入知识库，正在解析");
        setSelectedKnowledgeBaseId(knowledgeBaseId);
        await refreshKnowledgeBases();
      } catch (e) {
        setError(e instanceof Error ? e.message : "知识库入库失败");
      }
    },
    [isAuthenticated, refreshKnowledgeBases],
  );

  useEffect(() => {
    if (!detailPaperId) {
      setDetailPaper(null);
      setDetailError("");
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");

    apiClient
      .get<PaperDetailApi>(`/papers/${detailPaperId}`)
      .then((response) => {
        if (cancelled) return;
        setDetailPaper(toPaperDetail(response.data));
      })
      .catch(() => {
        if (cancelled) return;
        setDetailPaper(null);
        setDetailError("论文详情加载失败");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailPaperId]);

  return (
    <main className="mx-auto min-h-screen max-w-[1400px] px-6 pb-12 pt-20">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-700">浏览历史</h1>
        <div className="flex items-center gap-2">
          <button
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              enableTranslation
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
            onClick={() => setEnableTranslation((prev) => !prev)}
            type="button"
          >
            翻译
          </button>
          <button
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => {
              clearLocalViewedHistory();
              setLocalViewHistory([]);
            }}
            type="button"
          >
            清空本地
          </button>
        </div>
      </div>

      {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null}
      {loading ? <p className="mb-3 text-sm text-slate-500">加载中...</p> : null}
      {enableTranslation && translationRefreshing ? <p className="mb-3 text-xs text-slate-500">正在刷新翻译...</p> : null}

      {groupedViews.length === 0 && !loading ? <p className="text-sm text-slate-500">暂无浏览记录。</p> : null}

      <section className="space-y-6">
        {groupedViews.map((group) => (
          <article key={group.day}>
            <h2 className="text-base font-semibold text-slate-700">{group.day}</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => (
                <article
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white/95 p-4 shadow-[0_4px_12px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.12)]"
                  key={`${item.paper_id}-${item.viewed_at}`}
                  onClick={() => openDetail(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      openDetail(item);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <h3 className="line-clamp-2 text-base font-semibold text-slate-800">
                    {enableTranslation
                      ? paperDetailMap[item.paper_id]?.title_zh?.trim() || item.title_zh?.trim() || item.title
                      : paperDetailMap[item.paper_id]?.title?.trim() || item.title}
                  </h3>
                  <p className="mt-2 text-xs text-slate-500">
                    {item.published_date ?? "未知日期"} · {formatPaperSource(item.source)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    浏览 {item.view_count} 次 · {formatDateTime(item.viewed_at)}
                  </p>
                </article>
              ))}
            </div>
          </article>
        ))}
      </section>

      <PaperDetailModal
        error={detailError}
        favoriteFolders={favoriteFolders}
        defaultKnowledgeBaseId={selectedKnowledgeBaseId}
        isAuthenticated={isAuthenticated}
        knowledgeBases={knowledgeBases}
        loading={detailLoading}
        onAddToFavorite={handleAddFavorite}
        onAddToKnowledgeBase={handleAddToKnowledgeBase}
        onClose={() => setDetailPaperId(null)}
        onCreateFavoriteAndAdd={handleCreateFavoriteAndAdd}
        open={Boolean(detailPaperId)}
        paper={detailPaper}
      />
    </main>
  );
}
