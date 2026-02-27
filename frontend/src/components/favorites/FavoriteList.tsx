"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PaperDetailModal } from "@/components/search/PaperDetailModal";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api";
import {
  addPaperToFavorite,
  createFavorite,
  deleteFavorite,
  getFavoriteDetail,
  listFavorites,
  removePaperFromFavorite,
  updateFavorite,
} from "@/lib/favorites-api";
import { emitFavoritesUpdated } from "@/lib/favorites-sync";
import { addPaperToKnowledgeBase, listKnowledgeBases } from "@/lib/knowledge-base-api";
import { formatPaperSource } from "@/lib/paperSource";
import { savePaperView } from "@/lib/search-history-api";
import type { FavoriteDetail, FavoriteFolder } from "@/types/favorite";
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

export function FavoriteList() {
  const { hydrated, isAuthenticated } = useAuth();
  const [folders, setFolders] = useState<FavoriteFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FavoriteDetail | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [enableTranslation, setEnableTranslation] = useState(false);
  const [translationRefreshing, setTranslationRefreshing] = useState(false);
  const [paperDetailMap, setPaperDetailMap] = useState<Record<string, PaperDetailApi>>({});

  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([]);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");

  const [detailPaperId, setDetailPaperId] = useState<string | null>(null);
  const [detailPaper, setDetailPaper] = useState<PaperDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const selectedFolder = useMemo(
    () => folders.find((item) => item.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

  const refreshFolders = useCallback(
    async (preferredId?: string) => {
      if (!isAuthenticated) {
        setFolders([]);
        setSelectedFolderId(null);
        setDetail(null);
        return;
      }
      setLoadingFolders(true);
      setError("");
      try {
        const rows = await listFavorites();
        setFolders(rows);
        if (rows.length === 0) {
          setSelectedFolderId(null);
          setDetail(null);
        } else if (preferredId && rows.some((item) => item.id === preferredId)) {
          setSelectedFolderId(preferredId);
        } else if (selectedFolderId && rows.some((item) => item.id === selectedFolderId)) {
          // keep current selection
        } else {
          setSelectedFolderId(rows[0].id);
        }
        emitFavoritesUpdated();
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载收藏夹失败");
      } finally {
        setLoadingFolders(false);
      }
    },
    [isAuthenticated, selectedFolderId],
  );

  const refreshDetail = useCallback(async (folderId: string) => {
    setLoadingDetail(true);
    setError("");
    try {
      const row = await getFavoriteDetail(folderId);
      setDetail(row);
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : "加载收藏夹内容失败");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

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
      return;
    }
    void refreshFolders();
    void refreshKnowledgeBases();
  }, [hydrated, isAuthenticated, refreshFolders, refreshKnowledgeBases]);

  useEffect(() => {
    if (!selectedFolderId) {
      setDetail(null);
      setOpenFolderMenuId(null);
      return;
    }
    setOpenFolderMenuId(null);
    void refreshDetail(selectedFolderId);
  }, [selectedFolderId, refreshDetail]);

  useEffect(() => {
    if (!openFolderMenuId) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-folder-menu-root="true"]')) {
        return;
      }
      setOpenFolderMenuId(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [openFolderMenuId]);

  useEffect(() => {
    const ids = Array.from(new Set((detail?.items || []).map((item) => item.paper_id).filter(Boolean)));
    if (ids.length === 0) {
      setPaperDetailMap({});
      setTranslationRefreshing(false);
      return;
    }
    let cancelled = false;
    if (enableTranslation) {
      setTranslationRefreshing(true);
    }

    fetchPaperDetailMap(ids)
      .then((map) => {
        if (cancelled) return;
        setPaperDetailMap(map);
      })
      .finally(() => {
        if (!cancelled && enableTranslation) setTranslationRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detail?.items, enableTranslation]);

  const onCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const created = await createFavorite(name);
      setNewFolderName("");
      await refreshFolders(created.id);
      setNotice("收藏夹已创建");
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建收藏夹失败");
    } finally {
      setBusy(false);
    }
  };

  const onRenameFolder = async (folder: FavoriteFolder) => {
    const rawName = window.prompt("请输入新的收藏夹名称", folder.name);
    const name = rawName?.trim() || "";
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      await updateFavorite(folder.id, name);
      await refreshFolders(folder.id);
      setNotice("收藏夹已重命名");
    } catch (e) {
      setError(e instanceof Error ? e.message : "重命名收藏夹失败");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteFolder = async (folderId: string) => {
    if (!window.confirm("确认删除该收藏夹及其内容？")) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await deleteFavorite(folderId);
      const nextId = folders.find((item) => item.id !== folderId)?.id;
      await refreshFolders(nextId);
      setNotice("收藏夹已删除");
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除收藏夹失败");
    } finally {
      setBusy(false);
    }
  };

  const onRemoveItem = async (paperId: string) => {
    if (!selectedFolderId) return;
    setBusy(true);
    setError("");
    try {
      await removePaperFromFavorite(selectedFolderId, paperId);
      await refreshFolders(selectedFolderId);
      await refreshDetail(selectedFolderId);
      setNotice("已移出收藏");
    } catch (e) {
      setError(e instanceof Error ? e.message : "移除论文失败");
    } finally {
      setBusy(false);
    }
  };

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
        await refreshFolders(selectedFolderId ?? undefined);
      } catch (e) {
        setError(e instanceof Error ? e.message : "收藏失败");
      }
    },
    [isAuthenticated, refreshFolders, selectedFolderId],
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
        await refreshFolders(created.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "创建收藏夹失败");
      }
    },
    [isAuthenticated, refreshFolders],
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
        setSelectedKnowledgeBaseId(knowledgeBaseId);
        setNotice("论文已加入知识库，正在解析");
        await refreshKnowledgeBases();
      } catch (e) {
        setError(e instanceof Error ? e.message : "知识库入库失败");
      }
    },
    [isAuthenticated, refreshKnowledgeBases],
  );

  const openDetail = useCallback(
    async (paperId: string) => {
      setDetailPaperId(paperId);
      if (isAuthenticated) {
        void savePaperView(paperId).catch(() => undefined);
      }
    },
    [isAuthenticated],
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

  if (!hydrated) {
    return <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 text-sm text-slate-500">加载中...</section>;
  }

  if (!isAuthenticated) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 text-sm text-slate-600 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        登录后可管理收藏夹并保存论文。
      </section>
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[280px,minmax(0,1fr)]">
      <aside className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="新建收藏夹名称"
            value={newFolderName}
          />
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={busy || !newFolderName.trim()}
            onClick={() => void onCreateFolder()}
            type="button"
          >
            新建
          </button>
        </div>

        <div className="mt-4 max-h-[540px] space-y-2 overflow-y-auto pr-1">
          {loadingFolders ? <p className="text-xs text-slate-500">加载收藏夹中...</p> : null}
          {folders.map((folder) => {
            const active = folder.id === selectedFolderId;
            return (
              <div
                className={`rounded-xl border px-3 py-2 ${
                  active ? "border-slate-300 bg-slate-100 text-slate-800" : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
                key={folder.id}
                data-folder-menu-root="true"
              >
                <div className="flex items-start justify-between gap-2">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedFolderId(folder.id)} type="button">
                    <p className="text-sm font-medium">{folder.name}</p>
                    <p className={`mt-1 text-xs ${active ? "text-slate-600" : "text-slate-500"}`}>论文 {folder.item_count}</p>
                  </button>
                  <button
                    aria-label="收藏夹操作"
                    className="rounded-md border border-slate-300 px-2 py-1 text-base leading-none text-slate-600 hover:bg-white disabled:opacity-50"
                    disabled={busy}
                    onClick={() =>
                      setOpenFolderMenuId((prev) => (prev === folder.id ? null : folder.id))
                    }
                    type="button"
                  >
                    ⋯
                  </button>
                </div>
                {openFolderMenuId === folder.id ? (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-[0_10px_24px_rgba(15,23,42,0.10)]">
                    <button
                      className="w-full rounded-md px-2 py-1.5 text-left text-slate-700 hover:bg-slate-100"
                      onClick={() => {
                        setOpenFolderMenuId(null);
                        void onRenameFolder(folder);
                      }}
                      type="button"
                    >
                      编辑
                    </button>
                    <button
                      className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-red-600 hover:bg-red-50"
                      onClick={() => {
                        setOpenFolderMenuId(null);
                        void onDeleteFolder(folder.id);
                      }}
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!loadingFolders && folders.length === 0 ? <p className="text-xs text-slate-500">还没有收藏夹。</p> : null}
        </div>
      </aside>

      <article className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-700">{selectedFolder ? selectedFolder.name : "收藏内容"}</h2>
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
        </div>
        {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
        {notice ? <p className="mt-2 text-sm text-emerald-600">{notice}</p> : null}
        {enableTranslation && translationRefreshing ? <p className="mt-2 text-xs text-slate-500">正在刷新翻译...</p> : null}
        {!selectedFolder ? (
          <p className="mt-4 text-sm text-slate-500">选择左侧收藏夹查看内容。</p>
        ) : (
          <div className="mt-4">
            {loadingDetail ? <p className="text-sm text-slate-500">加载中...</p> : null}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {detail?.items.map((item) => {
                const paperInfo = paperDetailMap[item.paper_id];
                const displayDate = paperInfo?.published_date ?? "未知日期";
                const displaySource = paperInfo?.source ? formatPaperSource(paperInfo.source) : "未知来源";
                const displayTitle = enableTranslation
                  ? paperInfo?.title_zh?.trim() || item.title
                  : paperInfo?.title?.trim() || item.title;

                return (
                  <article
                    className="cursor-pointer rounded-xl border border-slate-200 bg-white/95 p-4 shadow-[0_4px_12px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.12)]"
                    key={item.paper_id}
                    onClick={() => void openDetail(item.paper_id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void openDetail(item.paper_id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <h3 className="line-clamp-2 text-base font-semibold text-slate-800">{displayTitle}</h3>
                    <p className="mt-2 text-xs text-slate-500">
                      {displayDate} · {displaySource}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      收藏顺序 {item.sort_order} · {item.arxiv_id}
                    </p>
                    <button
                      className="mt-3 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-white"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onRemoveItem(item.paper_id);
                      }}
                      type="button"
                    >
                      移除
                    </button>
                  </article>
                );
              })}
            </div>
            {!loadingDetail && detail && detail.items.length === 0 ? (
              <p className="text-sm text-slate-500">该收藏夹暂无论文。</p>
            ) : null}
          </div>
        )}
      </article>

      <PaperDetailModal
        error={detailError}
        favoriteFolders={folders}
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
    </section>
  );
}
