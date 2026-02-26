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
    if (!hydrated || !isAuthenticated) {
      return;
    }
    void refreshBases();
  }, [hydrated, isAuthenticated]);

  useEffect(() => {
    if (!selectedBaseId) {
      setDocs([]);
      setMessages([]);
      return;
    }
    setMessages([]);
    void refreshDocuments(selectedBaseId);
  }, [selectedBaseId]);

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
    try {
      await deleteKnowledgeBase(baseId);
      const nextBases = bases.filter((item) => item.id !== baseId);
      setBases(nextBases);
      setSelectedBaseId(nextBases[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除知识库失败");
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
    return <main className="mx-auto min-h-screen max-w-6xl px-6 pt-24 text-slate-600">加载中...</main>;
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
    <main className="mx-auto min-h-screen max-w-7xl px-6 pb-12 pt-20">
      <header className="mb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-700">知识库</h1>
        <p className="mt-1 text-sm text-slate-500">仅解析你上传的 PDF，并基于解析后的片段进行语义问答。</p>
      </header>

      {error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[280px,1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
          <h2 className="text-sm font-semibold text-slate-700">我的知识库</h2>
          <div className="mt-3 space-y-2">
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
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={creatingBase}
              onClick={() => void onCreateBase()}
              type="button"
            >
              {creatingBase ? "创建中..." : "新建知识库"}
            </button>
          </div>

          <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {loadingBases ? <p className="text-xs text-slate-500">加载中...</p> : null}
            {bases.map((item) => {
              const active = item.id === selectedBaseId;
              return (
                <button
                  className={`w-full rounded-xl border px-3 py-2 text-left ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                  key={item.id}
                  onClick={() => setSelectedBaseId(item.id)}
                  type="button"
                >
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className={`mt-1 text-xs ${active ? "text-slate-200" : "text-slate-500"}`}>
                    文档 {item.document_count}
                  </div>
                  <div className="mt-2">
                    <span
                      className={`text-xs underline ${active ? "text-slate-100" : "text-slate-500"}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void onDeleteBase(item.id);
                      }}
                    >
                      删除
                    </span>
                  </div>
                </button>
              );
            })}
            {!loadingBases && bases.length === 0 ? (
              <p className="text-xs text-slate-500">暂无知识库，先创建一个。</p>
            ) : null}
          </div>
        </aside>

        <section className="space-y-4">
          <article className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-semibold text-slate-700">
              文档管理{selectedBase ? ` - ${selectedBase.name}` : ""}
            </h2>
            <p className="mt-1 text-xs text-slate-500">仅支持 PDF。上传后自动解析、分块并生成向量。</p>

            <div className="mt-3 flex flex-col gap-2 md:flex-row">
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

            <div className="mt-4 space-y-2">
              {loadingDocs ? <p className="text-xs text-slate-500">加载文档中...</p> : null}
              {docs.map((doc) => (
                <div
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  key={doc.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">{doc.file_name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatBytes(doc.file_size)} · {doc.page_count} 页 · {doc.chunk_count} chunks
                      </p>
                      <p className="mt-1 text-xs text-slate-500">状态: {doc.parse_status}</p>
                      {doc.parse_error ? <p className="mt-1 text-xs text-red-500">{doc.parse_error}</p> : null}
                    </div>
                    <button
                      className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-white"
                      onClick={() => void onDeleteDocument(doc.id)}
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
              {!loadingDocs && docs.length === 0 ? (
                <p className="text-xs text-slate-500">当前知识库还没有文档。</p>
              ) : null}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-semibold text-slate-700">知识库对话</h2>
            <p className="mt-1 text-xs text-slate-500">回答基于所选知识库内的已解析内容。</p>

            <div className="mt-3 h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500">输入问题后开始对话。</p>
              ) : (
                messages.map((item, index) => (
                  <div key={`${item.role}-${index}`} className="text-sm">
                    <span className={`font-medium ${item.role === "user" ? "text-slate-700" : "text-blue-700"}`}>
                      {item.role === "user" ? "你" : "助手"}：
                    </span>
                    <span className="ml-1 whitespace-pre-wrap text-slate-700">{item.content}</span>
                  </div>
                ))
              )}
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
          </article>
        </section>
      </section>
    </main>
  );
}
