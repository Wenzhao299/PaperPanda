"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { useAuth } from "@/hooks/useAuth";

export default function RecoverPage() {
  const router = useRouter();
  const { resetPassword, sendRecoverCode } = useAuth();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
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
      await sendRecoverCode(email.trim());
      setMessage("验证码已发送，请检查邮箱。");
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

    if (newPassword !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword({
        email: email.trim(),
        code: code.trim(),
        new_password: newPassword,
      });
      setMessage("密码重置成功，请重新登录。");
      setTimeout(() => {
        router.push("/login");
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 p-7 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
        <h1 className="mb-4 text-center text-2xl font-semibold">账号找回</h1>
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
              {sendingCode ? "发送中" : cooldown > 0 ? `${cooldown}s` : "验证码"}
            </button>
          </div>

          <label className="block text-sm font-medium text-slate-700" htmlFor="code">
            验证码
          </label>
          <input
            id="code"
            type="text"
            className="w-full rounded border border-slate-300 px-3 py-2"
            placeholder="邮箱验证码"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            minLength={4}
            required
          />

          <label className="block text-sm font-medium text-slate-700" htmlFor="newPassword">
            新密码
          </label>
          <input
            id="newPassword"
            type="password"
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            required
          />

          <label className="block text-sm font-medium text-slate-700" htmlFor="confirmPassword">
            确认新密码
          </label>
          <input
            id="confirmPassword"
            type="password"
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={8}
            required
          />

          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            className="w-full rounded-md bg-paper-accent px-4 py-2 text-white disabled:opacity-60"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "提交中..." : "重置密码"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-600">
          想起密码了？
          <Link className="ml-1 text-paper-accent underline" href="/login">
            返回登录
          </Link>
        </p>
      </div>
    </main>
  );
}
