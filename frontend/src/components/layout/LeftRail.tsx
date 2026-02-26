"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api";
import type { UserProfile } from "@/types/user";

interface NavItem {
  href: string;
  label: string;
  icon: "search" | "history" | "favorites" | "knowledge";
}

const NAV_ITEMS: NavItem[] = [
  { href: "/search", label: "搜索", icon: "search" },
  { href: "/history", label: "历史", icon: "history" },
  { href: "/favorites", label: "收藏", icon: "favorites" },
  { href: "/chat", label: "知识库", icon: "knowledge" },
];

function RailIcon({ name }: { name: NavItem["icon"] }) {
  const cls = "h-4 w-4";
  if (name === "search") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 16L21 21" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "history") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24">
        <path d="M3 12a9 9 0 109-9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M3 4v5h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "favorites") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24">
        <path
          d="M6 4h12a1 1 0 011 1v15l-7-4-7 4V5a1 1 0 011-1z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24">
      <rect height="14" rx="2" stroke="currentColor" strokeWidth="1.8" width="18" x="3" y="5" />
      <path d="M8 10h8M8 14h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

export function LeftRail() {
  const pathname = usePathname();
  const { isAuthenticated, logout } = useAuth();
  const [panelOpen, setPanelOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setProfile(null);
      setProfileError("");
      return;
    }

    let cancelled = false;
    setLoadingProfile(true);
    apiClient
      .get<UserProfile>("/user/profile")
      .then((response) => {
        if (!cancelled) {
          setProfile(response.data);
          setProfileError("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
          setProfileError("暂时无法获取个人信息");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!panelOpen) {
        return;
      }
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setPanelOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [panelOpen]);

  const onLogout = async () => {
    await logout();
    setPanelOpen(false);
  };

  const userInitial = (profile?.nickname || profile?.email || "U").slice(0, 1).toUpperCase();

  return (
    <aside
      className="fixed left-2 top-2 z-20 flex h-[calc(100vh-16px)] w-14 flex-col items-center rounded-2xl border border-slate-200 bg-slate-50/95 py-2 shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
      ref={rootRef}
    >
      <button
        aria-label="用户中心"
        className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl border border-orange-200 bg-white text-sm font-semibold text-orange-500"
        onClick={() => setPanelOpen((prev) => !prev)}
        type="button"
        title="个人用户"
      >
        {isAuthenticated ? userInitial : "👤"}
      </button>

      {panelOpen ? (
        <section className="absolute left-[calc(100%+10px)] top-2 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.14)]">
          {isAuthenticated ? (
            <>
              <p className="text-xs text-slate-500">个人用户</p>
              <p className="mt-1 text-base font-semibold text-slate-800">{profile?.nickname || "未命名用户"}</p>
              <p className="mt-1 break-all text-sm text-slate-500">{profile?.email || "-"}</p>
              {loadingProfile ? <p className="mt-2 text-xs text-slate-400">正在加载资料...</p> : null}
              {profileError ? <p className="mt-2 text-xs text-red-500">{profileError}</p> : null}
              <button
                className="mt-4 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700"
                onClick={() => void onLogout()}
                type="button"
              >
                退出登录
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">你还未登录</p>
              <div className="mt-3 flex gap-2">
                <Link
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-center text-xs text-slate-700 hover:bg-slate-50"
                  href="/login"
                  onClick={() => setPanelOpen(false)}
                >
                  登录
                </Link>
                <Link
                  className="flex-1 rounded-lg bg-paper-accent px-3 py-2 text-center text-xs text-white hover:opacity-90"
                  href="/register"
                  onClick={() => setPanelOpen(false)}
                >
                  注册
                </Link>
              </div>
            </>
          )}
        </section>
      ) : null}

      <nav className="mt-5 flex flex-1 flex-col items-center gap-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              className={`flex w-11 flex-col items-center rounded-xl py-2 text-[11px] transition ${
                active ? "bg-white text-slate-700 shadow-sm" : "text-slate-500 hover:bg-white/80"
              }`}
              href={item.href}
              key={item.href}
              onClick={() => setPanelOpen(false)}
            >
              <span className="text-base">
                <RailIcon name={item.icon} />
              </span>
              <span className="mt-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
