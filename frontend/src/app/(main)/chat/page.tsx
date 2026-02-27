"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import {
  chatKnowledgeBase,
  createKnowledgeBase,
  deleteKnowledgeBase,
  deleteKnowledgeDocument,
  listKnowledgeBases,
  listKnowledgeDocuments,
  updateKnowledgeBase,
  updateKnowledgeDocument,
  uploadKnowledgeDocument,
} from "@/lib/knowledge-base-api";
import type { KnowledgeBaseItem, KnowledgeChatTurn, KnowledgeDocumentItem } from "@/types/knowledge-base";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatPage() {
  const { hydrated, isAuthenticated } = useAuth();
  const [bases, setBases] = useState<KnowledgeBaseItem[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [docs, setDocs] = useState<KnowledgeDocumentItem[]>([]);
  const [messages, setMessages] = useState<KnowledgeChatTurn[]>([]);
  const [baseName, setBaseName] = useState("");
  const [baseDesc, setBaseDesc] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loadingBases, setLoadingBases] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [creatingBase, setCreatingBase] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [busyBaseId, setBusyBaseId] = useState<string | null>(null);
  const [openBaseMenuId, setOpenBaseMenuId] = useState<string | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const [openDocMenu, setOpenDocMenu] = useState<{ docId: string; panel: "root" | "move" } | null>(null);

  const selectedBase = useMemo(
    () => bases.find((item) => item.id === selectedBaseId) || null,
    [bases, selectedBaseId],
  );

  const refreshBases = async (preferredId?: string) => {
    setLoadingBases(true);
    setError("");
    try {
      const rows = await listKnowledgeBases();
      setBases(rows);
      if (rows.length === 0) {
        setSelectedBaseId(null);
        return;
      }
      if (preferredId && rows.some((row) => row.id === preferredId)) {
        setSelectedBaseId(preferredId);
        return;
      }
      if (selectedBaseId && rows.some((row) => row.id === selectedBaseId)) {
        return;
      }
      setSelectedBaseId(rows[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载知识库失败");
    } finally {
      setLoadingBases(false);
    }
  };

  const refreshDocuments = async (baseId: string) => {
    setLoadingDocs(true);
    setError("");
    try {
      const rows = await listKnowledgeDocuments(baseId);
      setDocs(rows);
    } catch (e) {
      setDocs([]);
      setError(e instanceof Error ? e.message : "加载文档失败");
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    if (!hydrated || !isAuthenticated) return;
    void refreshBases();
  }, [hydrated, isAuthenticated]);

  useEffect(() => {
    if (!selectedBaseId) {
      setDocs([]);
      setMessages([]);
      setOpenBaseMenuId(null);
      setOpenDocMenu(null);
      return;
    }
    setMessages([]);
    setOpenBaseMenuId(null);
    setOpenDocMenu(null);
    void refreshDocuments(selectedBaseId);
  }, [selectedBaseId]);

  useEffect(() => {
    if (!openBaseMenuId) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-base-menu-root="true"]')) {
        return;
      }
      setOpenBaseMenuId(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [openBaseMenuId]);

  useEffect(() => {
    if (!openDocMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-doc-menu-root="true"]')) {
        return;
      }
      setOpenDocMenu(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [openDocMenu]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const doc of docs) {
      next[doc.id] = doc.knowledge_base_id;
    }
    setMoveTargets(next);
  }, [docs]);

  const onCreateBase = async () => {
    const name = baseName.trim();
    if (!name) {
      setError("请输入知识库名称");
      return;
    }
    setCreatingBase(true);
    setError("");
    try {
      const created = await createKnowledgeBase({ name, description: baseDesc.trim() });
      setBaseName("");
      setBaseDesc("");
      await refreshBases(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "新建知识库失败");
    } finally {
      setCreatingBase(false);
    }
  };

  const onDeleteBase = async (baseId: string) => {
    if (!window.confirm("删除后将移除该知识库的所有文档与向量，确认删除？")) {
      return;
    }
    setError("");
    setBusyBaseId(baseId);
    try {
      await deleteKnowledgeBase(baseId);
      const nextBases = bases.filter((item) => item.id !== baseId);
      setBases(nextBases);
      setSelectedBaseId(nextBases[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除知识库失败");
    } finally {
      setBusyBaseId(null);
    }
  };

  const onRenameBase = async (base: KnowledgeBaseItem) => {
    const nextNameRaw = window.prompt("请输入新的知识库名称", base.name);
    const nextName = nextNameRaw?.trim() || "";
    if (!nextName) return;
    setError("");
    setBusyBaseId(base.id);
    try {
      await updateKnowledgeBase(base.id, { name: nextName });
      await refreshBases(base.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "编辑知识库失败");
    } finally {
      setBusyBaseId(null);
    }
  };

  const onUpload = async () => {
    if (!selectedBaseId) {
      setError("请先选择知识库");
      return;
    }
    if (!selectedFile) {
      setError("请选择要上传的 PDF");
      return;
    }
    setUploading(true);
    setError("");
    try {
      await uploadKnowledgeDocument(selectedBaseId, selectedFile);
      setSelectedFile(null);
      await refreshDocuments(selectedBaseId);
      await refreshBases(selectedBaseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const onDeleteDocument = async (documentId: string) => {
    if (!selectedBaseId) return;
    setError("");
    try {
      await deleteKnowledgeDocument(selectedBaseId, documentId);
      await refreshDocuments(selectedBaseId);
      await refreshBases(selectedBaseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除文档失败");
    }
  };

  const onRenameDocument = async (doc: KnowledgeDocumentItem) => {
    if (!selectedBaseId) return;
    const nextName = window.prompt("请输入新的文件名", doc.file_name);
    if (!nextName || !nextName.trim()) return;
    setError("");
    setBusyDocId(doc.id);
    try {
      await updateKnowledgeDocument(selectedBaseId, doc.id, { file_name: nextName.trim() });
      await refreshDocuments(selectedBaseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "重命名文档失败");
    } finally {
      setBusyDocId(null);
    }
  };

  const onMoveDocument = async (doc: KnowledgeDocumentItem) => {
    if (!selectedBaseId) return;
    const targetId = (moveTargets[doc.id] || "").trim();
    if (!targetId || targetId === selectedBaseId) {
      setError("请选择目标知识库后再移动");
      return;
    }
    setError("");
    setBusyDocId(doc.id);
    try {
      await updateKnowledgeDocument(selectedBaseId, doc.id, { target_knowledge_base_id: targetId });
      await refreshDocuments(selectedBaseId);
      await refreshBases(selectedBaseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "移动文档失败");
    } finally {
      setBusyDocId(null);
    }
  };

  const onSendChat = async () => {
    if (!selectedBaseId) {
      setError("请先选择知识库");
      return;
    }
    const content = chatInput.trim();
    if (!content) return;

    const history = [...messages];
    const userTurn: KnowledgeChatTurn = { role: "user", content };
    const nextHistory = [...history, userTurn];
    setMessages(nextHistory);
    setChatInput("");
    setSending(true);
    setError("");

    try {
      const response = await chatKnowledgeBase(selectedBaseId, {
        message: content,
        history: history,
      });
      setMessages([...nextHistory, { role: "assistant", content: response.answer }]);
    } catch (e) {
      setMessages(history);
      setError(e instanceof Error ? e.message : "知识库对话失败");
    } finally {
      setSending(false);
    }
  };

  if (!hydrated) {
    return <main className="mx-auto min-h-screen max-w-7xl px-6 pt-24 text-slate-600">加载中...</main>;
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6">
        <section className="w-full rounded-2xl border border-slate-200 bg-white/90 p-8 text-center shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <h1 className="text-2xl font-semibold text-slate-700">知识库</h1>
          <p className="mt-2 text-sm text-slate-500">登录后可新建知识库、上传 PDF，并基于知识库对话。</p>
          <Link className="mt-5 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" href="/login">
            去登录
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1400px] px-6 pb-12 pt-20">
      <header className="mb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-700">知识库</h1>
        <p className="mt-1 text-sm text-slate-500">仅解析你上传或从搜索结果一键入库的 PDF，并基于解析片段进行问答。</p>
      </header>

      {error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}

      <section className="grid gap-4 xl:grid-cols-[280px,420px,minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <div className="space-y-2">
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
              placeholder="知识库名称"
              value={baseName}
              onChange={(event) => setBaseName(event.target.value)}
            />
            <textarea
              className="h-20 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
              placeholder="描述（可选）"
              value={baseDesc}
              onChange={(event) => setBaseDesc(event.target.value)}
            />
            <button
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              disabled={creatingBase}
              onClick={() => void onCreateBase()}
              type="button"
            >
              {creatingBase ? "创建中..." : "新建知识库"}
            </button>
          </div>

          <div className="mt-4 max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {loadingBases ? <p className="text-xs text-slate-500">加载中...</p> : null}
            {bases.map((item) => {
              const active = item.id === selectedBaseId;
              return (
                <div
                  className={`w-full rounded-xl border px-3 py-2 text-left ${
                    active
                      ? "border-slate-300 bg-slate-100 text-slate-800"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                  data-base-menu-root="true"
                  key={item.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedBaseId(item.id)} type="button">
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className={`mt-1 text-xs ${active ? "text-slate-600" : "text-slate-500"}`}>
                        文档 {item.document_count}
                      </div>
                    </button>
                    <button
                      aria-label="知识库操作"
                      className="rounded-md border border-slate-300 px-2 py-1 text-base leading-none text-slate-600 hover:bg-white disabled:opacity-50"
                      disabled={busyBaseId === item.id}
                      onClick={() => setOpenBaseMenuId((prev) => (prev === item.id ? null : item.id))}
                      type="button"
                    >
                      ⋯
                    </button>
                  </div>
                  {openBaseMenuId === item.id ? (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-[0_10px_24px_rgba(15,23,42,0.10)]">
                      <button
                        className="w-full rounded-md px-2 py-1.5 text-left text-slate-700 hover:bg-slate-100"
                        onClick={() => {
                          setOpenBaseMenuId(null);
                          void onRenameBase(item);
                        }}
                        type="button"
                      >
                        编辑
                      </button>
                      <button
                        className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-red-600 hover:bg-red-50"
                        onClick={() => {
                          setOpenBaseMenuId(null);
                          void onDeleteBase(item.id);
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
            {!loadingBases && bases.length === 0 ? <p className="text-xs text-slate-500">暂无知识库，先创建一个。</p> : null}
          </div>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <h2 className="text-lg font-semibold text-slate-700">论文管理{selectedBase ? ` - ${selectedBase.name}` : ""}</h2>
          <p className="mt-1 text-xs text-slate-500">支持 PDF 上传；也可在搜索卡片中一键添加到知识库。</p>

          <div className="mt-3 flex flex-col gap-2">
            <input
              accept=".pdf,application/pdf"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              type="file"
            />
            <button
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={uploading || !selectedBaseId || !selectedFile}
              onClick={() => void onUpload()}
              type="button"
            >
              {uploading ? "上传处理中..." : "上传 PDF"}
            </button>
          </div>

          <div className="mt-4 max-h-[590px] space-y-2 overflow-y-auto pr-1">
            {loadingDocs ? <p className="text-xs text-slate-500">加载文档中...</p> : null}
            {docs.map((doc) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" key={doc.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">{doc.file_name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatBytes(doc.file_size)} · {doc.page_count} 页 · {doc.chunk_count} chunks
                    </p>
                    <p className="mt-1 text-xs text-slate-500">状态: {doc.parse_status}</p>
                    {doc.parse_error ? <p className="mt-1 text-xs text-red-500">{doc.parse_error}</p> : null}
                  </div>
                  <div className="shrink-0" data-doc-menu-root="true">
                    <button
                      aria-label="文档操作"
                      className="rounded-md border border-slate-300 px-2 py-1 text-base leading-none text-slate-600 hover:bg-white disabled:opacity-50"
                      disabled={busyDocId === doc.id}
                      onClick={() =>
                        setOpenDocMenu((prev) =>
                          prev?.docId === doc.id ? null : { docId: doc.id, panel: "root" },
                        )
                      }
                      type="button"
                    >
                      ⋯
                    </button>
                  </div>
                </div>
                {openDocMenu?.docId === doc.id ? (
                  <div
                    className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-[0_10px_24px_rgba(15,23,42,0.10)]"
                    data-doc-menu-root="true"
                  >
                    {openDocMenu.panel === "root" ? (
                      <div className="space-y-1">
                        <button
                          className="w-full rounded-md px-2 py-1.5 text-left text-slate-700 hover:bg-slate-100"
                          onClick={() => {
                            setOpenDocMenu(null);
                            void onRenameDocument(doc);
                          }}
                          type="button"
                        >
                          重命名
                        </button>
                        <button
                          className="w-full rounded-md px-2 py-1.5 text-left text-slate-700 hover:bg-slate-100"
                          onClick={() => setOpenDocMenu({ docId: doc.id, panel: "move" })}
                          type="button"
                        >
                          移动
                        </button>
                        <button
                          className="w-full rounded-md px-2 py-1.5 text-left text-red-600 hover:bg-red-50"
                          onClick={() => {
                            setOpenDocMenu(null);
                            void onDeleteDocument(doc.id);
                          }}
                          type="button"
                        >
                          删除
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="px-1 text-[11px] text-slate-500">选择目标知识库</p>
                        <select
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
                          onChange={(event) =>
                            setMoveTargets((prev) => ({
                              ...prev,
                              [doc.id]: event.target.value,
                            }))
                          }
                          value={moveTargets[doc.id] || selectedBaseId || ""}
                        >
                          {bases.map((kb) => (
                            <option key={kb.id} value={kb.id}>
                              {kb.name}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            className="rounded-md border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50"
                            onClick={() => setOpenDocMenu({ docId: doc.id, panel: "root" })}
                            type="button"
                          >
                            返回
                          </button>
                          <button
                            className="rounded-md border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            disabled={busyDocId === doc.id}
                            onClick={() => {
                              void onMoveDocument(doc).finally(() => setOpenDocMenu(null));
                            }}
                            type="button"
                          >
                            确认移动
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
            {!loadingDocs && docs.length === 0 ? <p className="text-xs text-slate-500">当前知识库还没有文档。</p> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <h2 className="text-lg font-semibold text-slate-700">知识库对话</h2>
          <p className="mt-1 text-xs text-slate-500">回答基于当前知识库内已解析内容，超出范围会提示缺失信息。</p>

          <div className="mt-3 h-[620px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex min-h-full flex-col gap-3">
              {messages.length === 0 ? (
                <p className="my-auto text-center text-sm text-slate-500">输入问题后开始对话。</p>
              ) : (
                messages.map((item, index) => (
                  <div
                    className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}
                    key={`${item.role}-${index}`}
                  >
                    <div
                      className={`max-w-[86%] rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm ${
                        item.role === "user"
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{item.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
              disabled={!selectedBaseId || sending}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void onSendChat();
                }
              }}
              placeholder={selectedBaseId ? "输入问题..." : "请先选择知识库"}
              value={chatInput}
            />
            <button
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={!selectedBaseId || sending || !chatInput.trim()}
              onClick={() => void onSendChat()}
              type="button"
            >
              {sending ? "发送中..." : "发送"}
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
