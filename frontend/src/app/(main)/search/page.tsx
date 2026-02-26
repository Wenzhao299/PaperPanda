"use client";

import { useEffect, useMemo, useState } from "react";

import { SearchBar } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/SearchResults";
import { apiClient } from "@/lib/api";
import type { PaperSummary } from "@/types/paper";

interface SearchApiItem {
  id: string;
  arxiv_id: string;
  title: string;
  summary: string;
  primary_category: string;
  source: string;
  published_date: string | null;
}

interface SearchApiResponse {
  total: number;
  items: SearchApiItem[];
}

function toPaperSummary(item: SearchApiItem, index: number): PaperSummary {
  return {
    id: item.id,
    rank: index + 1,
    arxivId: item.arxiv_id,
    title: item.title,
    summary: item.summary,
    primaryCategory: item.primary_category,
    source: item.source,
    publishedDate: item.published_date ?? undefined,
    hotScore: 0,
  };
}

export default function SearchPage() {
  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submitQuery = (nextQuery?: string) => {
    const value = (nextQuery ?? queryInput).trim();
    if (!value) {
      setError("请输入检索关键词");
      return;
    }
    setError("");
    setHasSearched(true);
    setActiveQuery(value);
  };

  useEffect(() => {
    if (!activeQuery) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");

    apiClient
      .post<SearchApiResponse>("/search", {
        query: activeQuery,
        source: "all",
        categories: [],
        page: 1,
        page_size: 18,
      })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const mapped = response.data.items.map(toPaperSummary);
        setPapers(mapped);
        setTotal(response.data.total);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setPapers([]);
        setTotal(0);
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
  }, [activeQuery]);

  const statusText = useMemo(() => {
    if (!hasSearched) {
      return "输入主题后点击右侧按钮开始检索";
    }
    if (loading) {
      return "正在检索中...";
    }
    return `共 ${total} 条结果`;
  }, [loading, total]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 pb-16 pt-20">
      <section className="mx-auto max-w-2xl text-center">
        <h1 className="font-serif text-6xl font-semibold tracking-tight text-slate-700">PaperPanda</h1>
        <p className="mt-2 text-xl text-slate-600">语义检索、AI 总结、论文对话的一体化科研助手</p>
        <div className="mt-8">
          <SearchBar value={queryInput} onChange={setQueryInput} onSubmit={() => submitQuery()} />
        </div>
        <div className="mt-2 text-xs text-slate-500">{statusText}</div>
        {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
      </section>

      {!hasSearched ? null : papers.length > 0 ? (
        <SearchResults papers={papers} />
      ) : (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white/90 p-8 text-center text-sm text-slate-500">
          {loading ? "正在加载结果..." : "暂无结果，试试更具体的关键词。"}
        </section>
      )}
    </main>
  );
}
