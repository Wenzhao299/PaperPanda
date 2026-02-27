import type { LocalViewedPaperRecord } from "@/types/history";

const VIEW_HISTORY_KEY = "paperpanda:view-history";
const VIEWED_IDS_KEY = "paperpanda:viewed-paper-ids";
const HISTORY_LIMIT = 300;

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function listLocalViewedHistory(): LocalViewedPaperRecord[] {
  return readJson<LocalViewedPaperRecord[]>(VIEW_HISTORY_KEY, []);
}

export function listViewedPaperIds(): string[] {
  const rows = readJson<string[]>(VIEWED_IDS_KEY, []);
  return Array.from(new Set(rows.filter((item) => item.trim().length > 0)));
}

export function recordLocalPaperView(row: Omit<LocalViewedPaperRecord, "viewed_at" | "view_count">): void {
  const now = new Date().toISOString();
  const history = listLocalViewedHistory();
  const existing = history.find((item) => item.paper_id === row.paper_id);
  let nextHistory: LocalViewedPaperRecord[];

  if (existing) {
    existing.view_count += 1;
    existing.viewed_at = now;
    existing.title = row.title;
    existing.title_zh = row.title_zh;
    existing.source = row.source;
    existing.published_date = row.published_date;
    nextHistory = [existing, ...history.filter((item) => item.paper_id !== row.paper_id)];
  } else {
    nextHistory = [
      {
        ...row,
        viewed_at: now,
        view_count: 1,
      },
      ...history,
    ];
  }
  writeJson(VIEW_HISTORY_KEY, nextHistory.slice(0, HISTORY_LIMIT));

  const ids = listViewedPaperIds();
  if (!ids.includes(row.paper_id)) {
    ids.push(row.paper_id);
    writeJson(VIEWED_IDS_KEY, ids);
  }
}

export function clearLocalViewedHistory(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(VIEW_HISTORY_KEY);
}

export function resetViewedPaperMarkers(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(VIEWED_IDS_KEY);
}
