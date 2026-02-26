"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { useAuth } from "@/hooks/useAuth";

export default function RegisterPage() {
  const router = useRouter();
  const { register, sendCode } = useAuth();

  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const [sendingCode, setSendingCode] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canSendCode = useMemo(() => email.trim().length >= 5 && cooldown <= 0 && !sendingCode, [email, cooldown, sendingCode]);

  const tickCooldown = () => {
    let count = 60;
    setCooldown(count);
    const timer = setInterval(() => {
      count -= 1;
      setCooldown(count);
      if (count <= 0) {
        clearInterval(timer);
      }
    }, 1000);
  };

  const onSendCode = async () => {
    if (!canSendCode) {
      return;
    }
    setError("");
    setMessage("");
    setSendingCode(true);
    try {
      await sendCode(email.trim());
      setMessage("验证码已发送，请检查邮箱（或开发环境 Redis key）。");
      tickCooldown();
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送验证码失败");
    } finally {
      setSendingCode(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setRegistering(true);
    try {
      await register({
        email: email.trim(),
        password,
        code: code.trim(),
        nickname: nickname.trim(),
      });
      router.push("/search");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 p-7 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
        <h1 className="mb-4 text-center text-2xl font-semibold">注册</h1>
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">
            邮箱
          </label>
          <div className="flex gap-2">
            <input
              id="email"
              type="email"
              className="w-full rounded border border-slate-300 px-3 py-2"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <button
              className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
              onClick={onSendCode}
              type="button"
              disabled={!canSendCode}
            >
              {sendingCode ? "发送中" : cooldown > 0 ? `${cooldown}s` : "发送验证码"}
            </button>
          </div>

          <label className="block text-sm font-medium text-slate-700" htmlFor="nickname">
            昵称
          </label>
          <input
            id="nickname"
            type="text"
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="可选"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
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

          <label className="block text-sm font-medium text-slate-700" htmlFor="code">
            验证码
          </label>
          <input
            id="code"
            type="text"
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="6 位验证码"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            minLength={4}
            required
          />

          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            className="w-full rounded-md bg-paper-accent px-4 py-2 text-white disabled:opacity-60"
            type="submit"
            disabled={registering}
          >
            {registering ? "注册中..." : "注册并登录"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-600">
          已有账号？
          <Link className="ml-1 text-paper-accent underline" href="/login">
            去登录
          </Link>
        </p>
      </div>
    </main>
  );
}
