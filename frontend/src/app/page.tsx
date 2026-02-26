"use client";

import Link from "next/link";

import { useAuth } from "@/hooks/useAuth";

export default function HomePage() {
  const { isAuthenticated, logout } = useAuth();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-5xl font-semibold tracking-tight">PaperPanda</h1>
      <p className="max-w-2xl text-lg text-slate-700">语义检索、AI 总结、论文对话的一体化科研助手。</p>
      <div className="flex gap-3">
        <Link className="rounded-md bg-paper-accent px-4 py-2 text-white" href="/search">
          进入检索
        </Link>
        {isAuthenticated ? (
          <button className="rounded-md border border-slate-300 px-4 py-2" onClick={() => void logout()} type="button">
            退出登录
          </button>
        ) : (
          <>
            <Link className="rounded-md border border-slate-300 px-4 py-2" href="/login">
              登录
            </Link>
            <Link className="rounded-md border border-slate-300 px-4 py-2" href="/register">
              注册
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
