"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useAuth } from "@/hooks/useAuth";
import { addPaperToFavorite, createFavorite, listFavorites } from "@/lib/favorites-api";
import { emitFavoritesUpdated } from "@/lib/favorites-sync";
import { apiClient } from "@/lib/api";
import { addPaperToKnowledgeBase, listKnowledgeBases } from "@/lib/knowledge-base-api";
import { savePaperView } from "@/lib/search-history-api";
import { listViewedPaperIds, recordLocalPaperView, resetViewedPaperMarkers } from "@/lib/view-history";
import { PaperDetailModal } from "@/components/search/PaperDetailModal";
import { SearchBar, type SearchSource } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/SearchResults";
import type { FavoriteFolder } from "@/types/favorite";
import type { KnowledgeBaseItem } from "@/types/knowledge-base";
import type { PaperDetail, PaperSummary } from "@/types/paper";

interface SearchApiItem {
  id: string;
  arxiv_id: string;
  title: string;
  title_zh: string;
  abstract: string;
  abstract_zh: string;
  summary: string;
  authors: string[];
  primary_category: string;
  categories: string[];
  source: string;
  published_date: string | null;
  semantic_score?: number | null;
  keyword_score?: number | null;
  llm_score?: number | null;
  rerank_score?: number | null;
  baseline_score?: number | null;
}

interface SearchApiResponse {
  total: number;
  total_pages: number;
  items: SearchApiItem[];
}

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

interface ActiveSearch {
  query: string;
  source: SearchSource;
  publishedYear: number | null;
  enableTranslation: boolean;
  page: number;
  pageSize: number;
}

interface SearchPageCache {
  queryInput: string;
  source: SearchSource;
  publishedYear: number | null;
  enableTranslation: boolean;
  activeSearch: ActiveSearch | null;
  papers: PaperSummary[];
  total: number;
  totalPages: number;
  viewedPaperIds: string[];
}

interface ToastState {
  type: "error" | "success";
  message: string;
}

const DEFAULT_PAGE_SIZE = 18;
const SEARCH_PAGE_CACHE_KEY = "paperpanda:search-page-cache";

function toPaperSummary(item: SearchApiItem, rank: number): PaperSummary {
  return {
    id: item.id,
    rank,
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
    semanticScore: item.semantic_score ?? undefined,
    keywordScore: item.keyword_score ?? undefined,
    llmScore: item.llm_score ?? undefined,
    rerankScore: item.rerank_score ?? undefined,
    baselineScore: item.baseline_score ?? undefined,
  };
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

function normalizeSource(raw: unknown): SearchSource {
  if (raw === "arxiv" || raw === "conference" || raw === "journal" || raw === "all") {
    return raw;
  }
  return "arxiv";
}

function loadCache(): SearchPageCache | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(SEARCH_PAGE_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SearchPageCache>;
    return {
      queryInput: String(parsed.queryInput || ""),
      source: normalizeSource(parsed.source),
      publishedYear: typeof parsed.publishedYear === "number" ? parsed.publishedYear : null,
      enableTranslation: parsed.enableTranslation !== false,
      activeSearch: parsed.activeSearch ?? null,
      papers: Array.isArray(parsed.papers) ? parsed.papers : [],
      total: typeof parsed.total === "number" ? parsed.total : 0,
      totalPages: typeof parsed.totalPages === "number" ? parsed.totalPages : 0,
      viewedPaperIds: Array.isArray(parsed.viewedPaperIds) ? parsed.viewedPaperIds : [],
    };
  } catch {
    return null;
  }
}

function saveCache(payload: SearchPageCache): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SEARCH_PAGE_CACHE_KEY, JSON.stringify(payload));
}

export default function SearchPage() {
  const { hydrated, isAuthenticated } = useAuth();
  const searchParams = useSearchParams();
  const [queryInput, setQueryInput] = useState("");
  const [source, setSource] = useState<SearchSource>("arxiv");
  const [publishedYear, setPublishedYear] = useState<number | null>(null);
  const [enableTranslation, setEnableTranslation] = useState(true);

  const [activeSearch, setActiveSearch] = useState<ActiveSearch | null>(null);
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [translationRefreshing, setTranslationRefreshing] = useState(false);
  const translationRefreshKeyRef = useRef("");

  const [favoriteFolders, setFavoriteFolders] = useState<FavoriteFolder[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([]);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");
  const [viewedPaperIds, setViewedPaperIds] = useState<string[]>([]);

  const [detailPaperId, setDetailPaperId] = useState<string | null>(null);
  const [detailPaper, setDetailPaper] = useState<PaperDetail | null>(null);
  const [detailSeed, setDetailSeed] = useState<PaperSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);

  const [cacheHydrated, setCacheHydrated] = useState(false);
  const skipInitialFetchRef = useRef(false);
  const openedQueryPaperRef = useRef("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const localViewedIds = listViewedPaperIds();
    const cached = loadCache();
    if (cached) {
      setQueryInput(cached.queryInput);
      setSource(cached.source);
      setPublishedYear(cached.publishedYear);
      setEnableTranslation(cached.enableTranslation);
      setActiveSearch(cached.activeSearch);
      setPapers(cached.papers);
      setTotal(cached.total);
      setTotalPages(cached.totalPages);
      setViewedPaperIds(Array.from(new Set([...(cached.viewedPaperIds || []), ...localViewedIds])));
      if (cached.activeSearch) {
        skipInitialFetchRef.current = true;
      }
    } else {
      setViewedPaperIds(localViewedIds);
    }
    setCacheHydrated(true);
  }, []);

  useEffect(() => {
    if (!cacheHydrated) return;
    saveCache({
      queryInput,
      source,
      publishedYear,
      enableTranslation,
      activeSearch,
      papers,
      total,
      totalPages,
      viewedPaperIds,
    });
  }, [
    cacheHydrated,
    queryInput,
    source,
    publishedYear,
    enableTranslation,
    activeSearch,
    papers,
    total,
    totalPages,
    viewedPaperIds,
  ]);

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
    if (!hydrated) return;
    if (!isAuthenticated) {
      setFavoriteFolders([]);
      setKnowledgeBases([]);
      setSelectedKnowledgeBaseId("");
      return;
    }
    void refreshFavoriteFolders();
    void refreshKnowledgeBases();
  }, [hydrated, isAuthenticated, refreshFavoriteFolders, refreshKnowledgeBases]);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    const text = message.trim();
    if (!text) return;
    setToast({ type, message: text });
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    showToast("error", error);
    setError("");
  }, [error, showToast]);

  useEffect(() => {
    if (!notice) return;
    showToast("success", notice);
    setNotice("");
  }, [notice, showToast]);

  const submitQuery = () => {
    const value = queryInput.trim();
    if (!value) {
      setActiveSearch(null);
      setPapers([]);
      setTotal(0);
      setTotalPages(0);
      setDetailPaperId(null);
      setDetailPaper(null);
      setNotice("");
      return;
    }
    setError("");
    setNotice("");
    setActiveSearch({
      query: value,
      source,
      publishedYear,
      enableTranslation,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  };

  useEffect(() => {
    if (!cacheHydrated || !activeSearch) {
      return;
    }
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    apiClient
      .post<SearchApiResponse>("/search", {
        query: activeSearch.query,
        source: activeSearch.source,
        categories: [],
        published_year: activeSearch.publishedYear,
        page: activeSearch.page,
        page_size: activeSearch.pageSize,
        enable_translation: activeSearch.enableTranslation,
      })
      .then((response) => {
        if (cancelled) return;
        const rankBase = (activeSearch.page - 1) * activeSearch.pageSize;
        const nextTotal = response.data.total ?? 0;
        const nextTotalPages =
          typeof response.data.total_pages === "number" && response.data.total_pages > 0
            ? response.data.total_pages
            : Math.ceil(nextTotal / activeSearch.pageSize);
        setPapers(response.data.items.map((item, index) => toPaperSummary(item, rankBase + index + 1)));
        setTotal(nextTotal);
        setTotalPages(nextTotalPages);
      })
      .catch(() => {
        if (cancelled) return;
        setPapers([]);
        setTotal(0);
        setTotalPages(0);
        setError("检索失败，请稍后重试");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSearch, cacheHydrated]);

  useEffect(() => {
    if (!enableTranslation) {
      translationRefreshKeyRef.current = "";
      setTranslationRefreshing(false);
      return;
    }
    if (!activeSearch || papers.length === 0) {
      return;
    }
    const refreshKey = [
      activeSearch.query,
      activeSearch.source,
      String(activeSearch.publishedYear ?? ""),
      String(activeSearch.page),
      papers.map((item) => item.id).join(","),
    ].join("::");
    if (translationRefreshKeyRef.current === refreshKey) {
      return;
    }
    translationRefreshKeyRef.current = refreshKey;

    let cancelled = false;
    setTranslationRefreshing(true);

    Promise.all(
      papers.map(async (paper) => {
        try {
          const response = await apiClient.get<PaperDetailApi>(`/papers/${paper.id}`);
          return response.data;
        } catch {
          return null;
        }
      }),
    )
      .then((rows) => {
        if (cancelled) return;
        const detailMap = new Map<string, PaperDetailApi>();
        rows.forEach((row) => {
          if (row) detailMap.set(row.id, row);
        });
        if (detailMap.size === 0) return;
        setPapers((prev) =>
          prev.map((item) => {
            const row = detailMap.get(item.id);
            if (!row) return item;
            const titleZh = row.title_zh?.trim() || item.titleZh || item.title;
            const abstractZh = row.abstract_zh?.trim() || item.abstractZh || item.abstract;
            if (titleZh === item.titleZh && abstractZh === item.abstractZh) return item;
            return {
              ...item,
              titleZh,
              abstractZh,
            };
          }),
        );
      })
      .finally(() => {
        if (!cancelled) setTranslationRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enableTranslation, activeSearch, papers]);

  useEffect(() => {
    if (!detailPaperId) {
      setDetailPaper(null);
      setDetailSeed(null);
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
        const detail = toPaperDetail(response.data);
        if (detailSeed && detailSeed.id === detail.id) {
          if (!detail.titleZh || detail.titleZh === detail.title) {
            detail.titleZh = detailSeed.titleZh || detail.title;
          }
          if (!detail.abstractZh || detail.abstractZh === detail.abstract) {
            detail.abstractZh = detailSeed.abstractZh || detail.abstract;
          }
        }
        setDetailPaper(detail);
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
  }, [detailPaperId, detailSeed]);

  const effectiveTotalPages = useMemo(() => {
    if (!activeSearch) return 0;
    if (totalPages > 0) return totalPages;
    return Math.ceil(total / activeSearch.pageSize);
  }, [activeSearch, total, totalPages]);

  const statusText = useMemo(() => {
    if (!activeSearch) return "输入主题后点击右侧按钮开始检索";
    if (loading) return "正在检索中...";
    return `第 ${activeSearch.page} / ${Math.max(effectiveTotalPages, 1)} 页，共 ${total} 条结果`;
  }, [activeSearch, loading, total, effectiveTotalPages]);

  const pagination = useMemo(() => {
    if (!activeSearch || effectiveTotalPages <= 1) return [];
    const current = activeSearch.page;
    const start = Math.max(1, current - 2);
    const end = Math.min(effectiveTotalPages, current + 2);
    const pages: number[] = [];
    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }
    return pages;
  }, [activeSearch, effectiveTotalPages]);

  const jumpToPage = (nextPage: number) => {
    if (!activeSearch) return;
    if (nextPage < 1 || nextPage > effectiveTotalPages || nextPage === activeSearch.page) return;
    setActiveSearch({
      ...activeSearch,
      enableTranslation,
      page: nextPage,
    });
  };

  const handleAddFavorite = async (favoriteId: string, paperId: string) => {
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
  };

  const handleCreateFavoriteAndAdd = async (name: string, paperId: string) => {
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
  };

  const handleAddToKnowledgeBase = async (knowledgeBaseId: string, paperId: string) => {
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
  };

  const openDetail = useCallback(
    (paperId: string) => {
      const matched = papers.find((item) => item.id === paperId) ?? null;
      if (matched) {
        recordLocalPaperView({
          paper_id: matched.id,
          title: matched.title,
          title_zh: matched.titleZh,
          source: matched.source,
          published_date: matched.publishedDate,
        });
        setViewedPaperIds((prev) => (prev.includes(matched.id) ? prev : [...prev, matched.id]));
      }
      if (isAuthenticated) {
        void savePaperView(paperId).catch(() => undefined);
      }
      setDetailSeed(matched);
      setDetailPaperId(paperId);
    },
    [papers, isAuthenticated],
  );

  const detailPaperIdFromQuery = searchParams.get("paper_id");
  useEffect(() => {
    if (!detailPaperIdFromQuery) {
      openedQueryPaperRef.current = "";
      return;
    }
    if (openedQueryPaperRef.current === detailPaperIdFromQuery) {
      return;
    }
    openedQueryPaperRef.current = detailPaperIdFromQuery;
    openDetail(detailPaperIdFromQuery);
  }, [detailPaperIdFromQuery, openDetail]);

  const introMode = !activeSearch;

  return (
    <main className={`mx-auto max-w-6xl px-6 ${introMode ? "flex min-h-screen items-center justify-center py-16" : "min-h-screen pb-16 pt-20"}`}>
      {toast ? (
        <div className="fixed right-6 top-6 z-50">
          <div
            className={`rounded-lg px-4 py-2 text-sm shadow-[0_10px_24px_rgba(15,23,42,0.18)] ${
              toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
            }`}
          >
            {toast.message}
          </div>
        </div>
      ) : null}

      <section className={`mx-auto w-full max-w-3xl text-center ${introMode ? "-translate-y-8 md:-translate-y-12" : ""}`}>
        <h1 className="font-serif text-6xl font-semibold tracking-tight text-slate-700">PaperPanda</h1>
        <p className="mt-2 text-xl text-slate-600">语义检索、AI 总结、论文对话的一体化科研助手</p>
        <div className="mt-8">
          <SearchBar
            enableTranslation={enableTranslation}
            onChange={setQueryInput}
            onEnableTranslationChange={setEnableTranslation}
            onPublishedYearChange={setPublishedYear}
            onSourceChange={setSource}
            onSubmit={submitQuery}
            publishedYear={publishedYear}
            source={source}
            value={queryInput}
          />
        </div>
      </section>

      {!introMode ? (
        <>
          {papers.length > 0 ? (
            <SearchResults
              favoriteFolders={favoriteFolders}
              knowledgeBases={knowledgeBases}
              isAuthenticated={isAuthenticated}
              onAddToFavorite={handleAddFavorite}
              onAddToKnowledgeBase={handleAddToKnowledgeBase}
              onCreateFavoriteAndAdd={handleCreateFavoriteAndAdd}
              onOpenDetail={openDetail}
              papers={papers}
              selectedKnowledgeBaseId={selectedKnowledgeBaseId}
              showTranslated={enableTranslation}
              viewedPaperIds={viewedPaperIds}
            />
          ) : (
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white/90 p-8 text-center text-sm text-slate-500">
              {loading ? "正在加载结果..." : "暂无结果，试试更具体的关键词。"}
            </section>
          )}

          <section className="mt-6 rounded-xl border border-slate-200 bg-white/90 px-4 py-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-slate-600">{statusText}</p>
                  {enableTranslation && translationRefreshing ? (
                    <p className="mt-1 text-xs text-slate-500">正在异步刷新当前页翻译...</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {effectiveTotalPages > 1 ? (
                    <>
                      <button
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={loading || !activeSearch || activeSearch.page <= 1}
                        onClick={() => activeSearch && jumpToPage(activeSearch.page - 1)}
                        type="button"
                      >
                        上一页
                      </button>
                      {pagination.map((pageNo) => (
                        <button
                          className={`rounded-lg px-3 py-1.5 ${
                            activeSearch && pageNo === activeSearch.page
                              ? "bg-slate-800 text-white"
                              : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                          disabled={loading}
                          key={pageNo}
                          onClick={() => jumpToPage(pageNo)}
                          type="button"
                        >
                          {pageNo}
                        </button>
                      ))}
                      <button
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={loading || !activeSearch || activeSearch.page >= effectiveTotalPages}
                        onClick={() => activeSearch && jumpToPage(activeSearch.page + 1)}
                        type="button"
                      >
                        下一页
                      </button>
                    </>
                  ) : null}
                  <button
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={loading}
                    onClick={() => {
                      resetViewedPaperMarkers();
                      setViewedPaperIds([]);
                    }}
                    type="button"
                  >
                    重置已读标识
                  </button>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

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
