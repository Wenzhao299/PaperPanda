import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { FavoriteFolder } from "@/types/favorite";
import type { KnowledgeBaseItem } from "@/types/knowledge-base";
import type { PaperSummary } from "@/types/paper";
import { formatPaperSource } from "@/lib/paperSource";

interface PaperCardProps {
  paper: PaperSummary;
  showTranslated: boolean;
  onOpenDetail: (paperId: string) => void;
  isViewed: boolean;
  favoriteFolders: FavoriteFolder[];
  onAddToFavorite: (favoriteId: string, paperId: string) => Promise<void>;
  onCreateFavoriteAndAdd: (name: string, paperId: string) => Promise<void>;
  knowledgeBases: KnowledgeBaseItem[];
  defaultKnowledgeBaseId: string;
  onAddToKnowledgeBase: (knowledgeBaseId: string, paperId: string) => Promise<void>;
  isAuthenticated: boolean;
}

type ActionPopover = "favorite" | "knowledge" | null;

export function PaperCard({
  paper,
  showTranslated,
  onOpenDetail,
  isViewed,
  favoriteFolders,
  onAddToFavorite,
  onCreateFavoriteAndAdd,
  knowledgeBases,
  defaultKnowledgeBaseId,
  onAddToKnowledgeBase,
  isAuthenticated,
}: PaperCardProps) {
  const [selectedFavoriteId, setSelectedFavoriteId] = useState("");
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [openPopover, setOpenPopover] = useState<ActionPopover>(null);
  const popoverRootRef = useRef<HTMLDivElement | null>(null);

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
    const onMouseDown = (event: MouseEvent) => {
      if (!openPopover) return;
      if (popoverRootRef.current && !popoverRootRef.current.contains(event.target as Node)) {
        setOpenPopover(null);
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [openPopover]);

  const translatedTitle = paper.titleZh?.trim() || paper.title;
  const translatedAbstract = paper.abstractZh?.trim() || paper.abstract;
  const title = showTranslated ? translatedTitle : paper.title;
  const content = showTranslated ? translatedAbstract : paper.abstract;
  const viewedClass = isViewed ? "border-slate-300 bg-slate-100/85" : "border-slate-200 bg-white/95";

  return (
    <article
      className={`cursor-pointer rounded-xl border p-4 shadow-[0_4px_12px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.12)] ${viewedClass}`}
      onClick={() => onOpenDetail(paper.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onOpenDetail(paper.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <h3 className="line-clamp-2 text-base font-semibold text-slate-800">
        {paper.rank ? `${paper.rank}. ` : ""}
        {title}
      </h3>

      <div className="mt-2 flex items-start justify-between gap-2">
        <p className="text-xs text-slate-500">
          {paper.publishedDate ?? "未知日期"} · {formatPaperSource(paper.source)}
        </p>

        <div
          className="relative shrink-0"
          onClick={(event) => event.stopPropagation()}
          ref={popoverRootRef}
          role="presentation"
        >
          <div className="flex items-center gap-1">
            <button
              aria-label="收藏论文"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-slate-500 hover:bg-slate-50"
              onClick={() => setOpenPopover((prev) => (prev === "favorite" ? null : "favorite"))}
              type="button"
            >
              <svg fill="none" viewBox="0 0 24 24" className="h-4 w-4">
                <path
                  d="M6 4h12a1 1 0 011 1v15l-7-4-7 4V5a1 1 0 011-1z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
            </button>
            <button
              aria-label="加入知识库"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-slate-500 hover:bg-slate-50"
              onClick={() => setOpenPopover((prev) => (prev === "knowledge" ? null : "knowledge"))}
              type="button"
            >
              <svg fill="none" viewBox="0 0 24 24" className="h-4 w-4">
                <rect height="14" rx="2" stroke="currentColor" strokeWidth="1.8" width="18" x="3" y="5" />
                <path d="M8 10h8M8 14h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
              </svg>
            </button>
          </div>

          {openPopover === "favorite" ? (
            <section className="absolute right-0 top-8 z-20 w-60 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-[0_10px_24px_rgba(15,23,42,0.14)]">
              <p className="font-medium text-slate-700">收藏论文</p>
              {!isAuthenticated ? (
                <p className="mt-2 text-slate-500">请先登录后收藏。</p>
              ) : (
                <>
                  {favoriteFolders.length > 0 ? (
                    <select
                      className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-slate-700"
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
                    <p className="mt-2 text-slate-500">暂无收藏夹，可新建后加入。</p>
                  )}

                  <div className="mt-2 flex items-center gap-2">
                    <button
                      className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      disabled={!selectedFavoriteId || favoriteLoading}
                      onClick={() => {
                        if (!selectedFavoriteId) return;
                        setFavoriteLoading(true);
                        onAddToFavorite(selectedFavoriteId, paper.id)
                          .then(() => setOpenPopover(null))
                          .finally(() => setFavoriteLoading(false));
                      }}
                      type="button"
                    >
                      {favoriteLoading ? "处理中..." : "收藏"}
                    </button>
                    <button
                      className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      disabled={favoriteLoading}
                      onClick={() => {
                        const name = window.prompt("请输入新收藏夹名称");
                        if (!name || !name.trim()) return;
                        setFavoriteLoading(true);
                        onCreateFavoriteAndAdd(name.trim(), paper.id)
                          .then(() => setOpenPopover(null))
                          .finally(() => setFavoriteLoading(false));
                      }}
                      type="button"
                    >
                      新建夹
                    </button>
                  </div>
                </>
              )}
            </section>
          ) : null}

          {openPopover === "knowledge" ? (
            <section className="absolute right-0 top-8 z-20 w-60 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-[0_10px_24px_rgba(15,23,42,0.14)]">
              <p className="font-medium text-slate-700">加入知识库</p>
              {!isAuthenticated ? (
                <p className="mt-2 text-slate-500">请先登录后使用。</p>
              ) : knowledgeBases.length === 0 ? (
                <div className="mt-2 space-y-1 text-slate-500">
                  <p>暂无知识库。</p>
                  <Link className="text-slate-700 underline" href="/chat">
                    去新建知识库
                  </Link>
                </div>
              ) : (
                <>
                  <select
                    className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-slate-700"
                    onChange={(event) => setSelectedKnowledgeBaseId(event.target.value)}
                    value={selectedKnowledgeBaseId}
                  >
                    {knowledgeBases.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="mt-2 rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    disabled={!selectedKnowledgeBaseId || knowledgeLoading}
                    onClick={() => {
                      if (!selectedKnowledgeBaseId) return;
                      setKnowledgeLoading(true);
                      onAddToKnowledgeBase(selectedKnowledgeBaseId, paper.id)
                        .then(() => setOpenPopover(null))
                        .finally(() => setKnowledgeLoading(false));
                    }}
                    type="button"
                  >
                    {knowledgeLoading ? "处理中..." : "加入知识库"}
                  </button>
                </>
              )}
            </section>
          ) : null}
        </div>
      </div>

      {isViewed ? <p className="mt-1 text-[11px] text-slate-500">已浏览</p> : null}
      <p className="mt-3 line-clamp-3 text-sm text-slate-600">{content}</p>
      {paper.authors.length > 0 ? (
        <p className="mt-2 line-clamp-1 text-xs text-slate-500">{paper.authors.slice(0, 3).join(", ")}</p>
      ) : null}
    </article>
  );
}
