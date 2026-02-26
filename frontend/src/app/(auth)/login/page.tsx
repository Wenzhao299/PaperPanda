"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login({ email: email.trim(), password });
      router.push("/search");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 p-7 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
          <h1 className="mb-4 text-2xl font-semibold">你已登录</h1>
          <button
            className="rounded-md bg-paper-accent px-4 py-2 text-white"
            onClick={() => router.push("/search")}
            type="button"
          >
            前往检索页
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 p-7 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
        <h1 className="mb-4 text-center text-2xl font-semibold">登录</h1>
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">
            邮箱
          </label>
          <input
            id="email"
            type="email"
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label className="block text-sm font-medium text-slate-700" htmlFor="password">
            密码
          </label>
          <input
            id="password"
            type="password"
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="至少 8 位"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />

          <div className="text-right text-sm">
            <Link className="text-slate-500 hover:text-paper-accent hover:underline" href="/recover">
              忘记密码？
            </Link>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            className="w-full rounded-md bg-paper-accent px-4 py-2 text-white disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-600">
          还没有账号？
          <Link className="ml-1 text-paper-accent underline" href="/register">
            去注册
          </Link>
        </p>
      </div>
    </main>
  );
}
