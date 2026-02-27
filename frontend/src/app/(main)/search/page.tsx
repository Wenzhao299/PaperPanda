"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { PaperDetailModal } from "@/components/search/PaperDetailModal";
import { SearchBar, type SearchSource } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/SearchResults";
import { apiClient } from "@/lib/api";
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

const DEFAULT_PAGE_SIZE = 18;

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

export default function SearchPage() {
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
  const [translationRefreshing, setTranslationRefreshing] = useState(false);
  const translationRefreshKeyRef = useRef("");

  const [detailPaperId, setDetailPaperId] = useState<string | null>(null);
  const [detailPaper, setDetailPaper] = useState<PaperDetail | null>(null);
  const [detailSeed, setDetailSeed] = useState<PaperSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const submitQuery = () => {
    const value = queryInput.trim();
    if (!value) {
      setError("请输入检索关键词");
      return;
    }
    setError("");
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
    if (!activeSearch) {
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
        if (cancelled) {
          return;
        }
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
        if (cancelled) {
          return;
        }
        setPapers([]);
        setTotal(0);
        setTotalPages(0);
        setError("检索失败，请稍后重试");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSearch]);

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
        if (cancelled) {
          return;
        }
        const detailMap = new Map<string, PaperDetailApi>();
        rows.forEach((row) => {
          if (row) {
            detailMap.set(row.id, row);
          }
        });
        if (detailMap.size === 0) {
          return;
        }
        setPapers((prev) =>
          prev.map((item) => {
            const row = detailMap.get(item.id);
            if (!row) {
              return item;
            }
            const titleZh = row.title_zh?.trim() || item.titleZh || item.title;
            const abstractZh = row.abstract_zh?.trim() || item.abstractZh || item.abstract;
            if (titleZh === item.titleZh && abstractZh === item.abstractZh) {
              return item;
            }
            return {
              ...item,
              titleZh,
              abstractZh,
            };
          }),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setTranslationRefreshing(false);
        }
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
        if (!cancelled) {
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
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetailPaper(null);
          setDetailError("论文详情加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailPaperId, detailSeed]);

  const effectiveTotalPages = useMemo(() => {
    if (!activeSearch) {
      return 0;
    }
    if (totalPages > 0) {
      return totalPages;
    }
    return Math.ceil(total / activeSearch.pageSize);
  }, [activeSearch, total, totalPages]);

  const statusText = useMemo(() => {
    if (!activeSearch) {
      return "输入主题后点击右侧按钮开始检索";
    }
    if (loading) {
      return "正在检索中...";
    }
    return `第 ${activeSearch.page} / ${Math.max(effectiveTotalPages, 1)} 页，共 ${total} 条结果`;
  }, [activeSearch, loading, total, effectiveTotalPages]);

  const pagination = useMemo(() => {
    if (!activeSearch || effectiveTotalPages <= 1) {
      return [];
    }
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
    if (!activeSearch) {
      return;
    }
    if (nextPage < 1 || nextPage > effectiveTotalPages || nextPage === activeSearch.page) {
      return;
    }
    setActiveSearch({
      ...activeSearch,
      enableTranslation,
      page: nextPage,
    });
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 pb-16 pt-20">
      <section className="mx-auto max-w-2xl text-center">
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
        {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
      </section>

      {!activeSearch ? null : papers.length > 0 ? (
        <>
          <SearchResults
            onOpenDetail={(paperId) => {
              const matched = papers.find((item) => item.id === paperId) ?? null;
              setDetailSeed(matched);
              setDetailPaperId(paperId);
            }}
            papers={papers}
            showTranslated={enableTranslation}
          />
        </>
      ) : (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white/90 p-8 text-center text-sm text-slate-500">
          {loading ? "正在加载结果..." : "暂无结果，试试更具体的关键词。"}
        </section>
      )}

      {activeSearch ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white/90 px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-slate-600">{statusText}</p>
              {enableTranslation && translationRefreshing ? (
                <p className="mt-1 text-xs text-slate-500">正在异步刷新当前页翻译...</p>
              ) : null}
            </div>
            {effectiveTotalPages > 1 ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={loading || activeSearch.page <= 1}
                  onClick={() => jumpToPage(activeSearch.page - 1)}
                  type="button"
                >
                  上一页
                </button>
                {pagination.map((pageNo) => (
                  <button
                    className={`rounded-lg px-3 py-1.5 ${
                      pageNo === activeSearch.page
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
                  disabled={loading || activeSearch.page >= effectiveTotalPages}
                  onClick={() => jumpToPage(activeSearch.page + 1)}
                  type="button"
                >
                  下一页
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <PaperDetailModal
        error={detailError}
        loading={detailLoading}
        onClose={() => setDetailPaperId(null)}
        open={Boolean(detailPaperId)}
        paper={detailPaper}
      />
    </main>
  );
}
