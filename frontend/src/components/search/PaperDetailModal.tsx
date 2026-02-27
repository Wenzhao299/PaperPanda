"use client";

import { useEffect, useState } from "react";

import { formatPaperSource, isArxivSource } from "@/lib/paperSource";
import type { FavoriteFolder } from "@/types/favorite";
import type { KnowledgeBaseItem } from "@/types/knowledge-base";
import type { PaperDetail } from "@/types/paper";

interface PaperDetailModalProps {
  open: boolean;
  paper: PaperDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  isAuthenticated?: boolean;
  favoriteFolders?: FavoriteFolder[];
  knowledgeBases?: KnowledgeBaseItem[];
  defaultKnowledgeBaseId?: string;
  onAddToFavorite?: (favoriteId: string, paperId: string) => Promise<void>;
  onCreateFavoriteAndAdd?: (name: string, paperId: string) => Promise<void>;
  onAddToKnowledgeBase?: (knowledgeBaseId: string, paperId: string) => Promise<void>;
}

type ActionPanel = "favorite" | "knowledge" | null;

export function PaperDetailModal({
  open,
  paper,
  loading,
  error,
  onClose,
  isAuthenticated = false,
  favoriteFolders = [],
  knowledgeBases = [],
  defaultKnowledgeBaseId = "",
  onAddToFavorite,
  onCreateFavoriteAndAdd,
  onAddToKnowledgeBase,
}: PaperDetailModalProps) {
  const [selectedFavoriteId, setSelectedFavoriteId] = useState("");
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [actionPanel, setActionPanel] = useState<ActionPanel>(null);

  useEffect(() => {
    if (!favoriteFolders.length) {
      setSelectedFavoriteId("");
      return;
    }
    if (!favoriteFolders.some((item) => item.id === selectedFavoriteId)) {
      setSelectedFavoriteId(favoriteFolders[0].id);
    }
  }, [favoriteFolders, selectedFavoriteId]);

  useEffect(() => {
    if (!knowledgeBases.length) {
      setSelectedKnowledgeBaseId("");
      return;
    }
    if (knowledgeBases.some((item) => item.id === selectedKnowledgeBaseId)) {
      return;
    }
    if (defaultKnowledgeBaseId && knowledgeBases.some((item) => item.id === defaultKnowledgeBaseId)) {
      setSelectedKnowledgeBaseId(defaultKnowledgeBaseId);
      return;
    }
    setSelectedKnowledgeBaseId(knowledgeBases[0].id);
  }, [knowledgeBases, selectedKnowledgeBaseId, defaultKnowledgeBaseId]);

  useEffect(() => {
    if (!open) {
      setActionPanel(null);
      return;
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onEscape);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const displayTitle = paper?.titleZh || paper?.title || "论文详情";
  const originalTitle = paper?.title?.trim() || "";
  const showOriginalTitle = Boolean(originalTitle) && originalTitle !== displayTitle;
  const originalAbstract = paper?.abstract || "";
  const translatedAbstract = paper?.abstractZh || paper?.abstract || "";
  const hasBilingualAbstract = Boolean(originalAbstract) && translatedAbstract !== originalAbstract;
  const isArxiv = Boolean(paper?.source && isArxivSource(paper.source));
  const arxivPage =
    paper?.arxivId && isArxiv ? `https://arxiv.org/abs/${paper.arxivId.replace(/v\d+$/, "")}` : "";
  const canFavorite =
    isAuthenticated && Boolean(paper?.id) && typeof onAddToFavorite === "function" && typeof onCreateFavoriteAndAdd === "function";
  const canKnowledge = isAuthenticated && Boolean(paper?.id) && typeof onAddToKnowledgeBase === "function";

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 px-4 py-8"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_20px_40px_rgba(15,23,42,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-2xl font-semibold text-slate-800">{displayTitle}</h2>
          <button
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </div>
        {showOriginalTitle ? <p className="mt-1 text-sm text-slate-500">{originalTitle}</p> : null}

        {loading ? <p className="mt-5 text-sm text-slate-500">正在加载论文详情...</p> : null}
        {error ? <p className="mt-5 text-sm text-red-500">{error}</p> : null}

        {!loading && !error && paper ? (
          <div className="mt-5 space-y-4 text-sm text-slate-700">
            <p className="text-slate-500">
              {paper.publishedDate ?? "未知日期"} · {formatPaperSource(paper.source)} · {paper.primaryCategory}
            </p>
            <p>{paper.authors.join(", ") || "作者信息缺失"}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              {paper.arxivId ? (
                <span className="rounded-full bg-slate-100 px-2 py-1">{isArxiv ? `arXiv: ${paper.arxivId}` : `ID: ${paper.arxivId}`}</span>
              ) : null}
              {paper.categories.map((category) => (
                <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700" key={category}>
                  {category}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              {paper.pdfUrl ? (
                <a
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700"
                  href={paper.pdfUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  PDF
                </a>
              ) : null}
              {arxivPage ? (
                <a
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                  href={arxivPage}
                  rel="noreferrer"
                  target="_blank"
                >
                  论文主页
                </a>
              ) : null}
              {paper.doi ? (
                <a
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                  href={`https://doi.org/${paper.doi}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  DOI: {paper.doi}
                </a>
              ) : null}
              <button
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={!canFavorite || favoriteLoading || !paper.id}
                onClick={() => setActionPanel((prev) => (prev === "favorite" ? null : "favorite"))}
                type="button"
              >
                收藏
              </button>
              <button
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={!canKnowledge || knowledgeLoading || !paper.id}
                onClick={() => setActionPanel((prev) => (prev === "knowledge" ? null : "knowledge"))}
                type="button"
              >
                一键入库
              </button>
            </div>

            {!isAuthenticated ? <p className="text-xs text-slate-500">登录后可收藏并一键入库。</p> : null}

            {actionPanel === "favorite" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
                {favoriteFolders.length > 0 ? (
                  <select
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-slate-700"
                    onChange={(event) => setSelectedFavoriteId(event.target.value)}
                    value={selectedFavoriteId}
                  >
                    {favoriteFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-slate-500">暂无收藏夹，可新建后收藏。</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    className="rounded-md border border-slate-300 px-2 py-1 text-slate-700 hover:bg-white disabled:opacity-50"
                    disabled={!selectedFavoriteId || favoriteLoading || !paper.id}
                    onClick={() => {
                      if (!paper.id || !selectedFavoriteId || !onAddToFavorite) return;
                      setFavoriteLoading(true);
                      onAddToFavorite(selectedFavoriteId, paper.id)
                        .then(() => setActionPanel(null))
                        .finally(() => setFavoriteLoading(false));
                    }}
                    type="button"
                  >
                    {favoriteLoading ? "处理中..." : "收藏"}
                  </button>
                  <button
                    className="rounded-md border border-slate-300 px-2 py-1 text-slate-700 hover:bg-white disabled:opacity-50"
                    disabled={favoriteLoading || !paper.id}
                    onClick={() => {
                      if (!paper.id || !onCreateFavoriteAndAdd) return;
                      const name = window.prompt("请输入新收藏夹名称");
                      if (!name || !name.trim()) return;
                      setFavoriteLoading(true);
                      onCreateFavoriteAndAdd(name.trim(), paper.id)
                        .then(() => setActionPanel(null))
                        .finally(() => setFavoriteLoading(false));
                    }}
                    type="button"
                  >
                    新建夹
                  </button>
                </div>
              </div>
            ) : null}

            {actionPanel === "knowledge" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
                {knowledgeBases.length > 0 ? (
                  <>
                    <select
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-slate-700"
                      onChange={(event) => setSelectedKnowledgeBaseId(event.target.value)}
                      value={selectedKnowledgeBaseId}
                    >
                      {knowledgeBases.map((kb) => (
                        <option key={kb.id} value={kb.id}>
                          {kb.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="mt-2 rounded-md border border-slate-300 px-2 py-1 text-slate-700 hover:bg-white disabled:opacity-50"
                      disabled={!selectedKnowledgeBaseId || knowledgeLoading || !paper.id}
                      onClick={() => {
                        if (!paper.id || !selectedKnowledgeBaseId || !onAddToKnowledgeBase) return;
                        setKnowledgeLoading(true);
                        onAddToKnowledgeBase(selectedKnowledgeBaseId, paper.id)
                          .then(() => setActionPanel(null))
                          .finally(() => setKnowledgeLoading(false));
                      }}
                      type="button"
                    >
                      {knowledgeLoading ? "处理中..." : "加入知识库"}
                    </button>
                  </>
                ) : (
                  <p className="text-slate-500">暂无知识库，请先在知识库页面创建。</p>
                )}
              </div>
            ) : null}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">摘要</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{translatedAbstract}</p>
              {hasBilingualAbstract ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{originalAbstract}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
