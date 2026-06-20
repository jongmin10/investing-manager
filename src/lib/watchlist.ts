const KEY = "screener-watchlist";

export function getWatchlist(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const s = localStorage.getItem(KEY);
    return new Set(s ? JSON.parse(s) : []);
  } catch { return new Set(); }
}

export function toggleWatchlistItem(id: string): Set<string> {
  const current = getWatchlist();
  if (current.has(id)) current.delete(id);
  else current.add(id);
  localStorage.setItem(KEY, JSON.stringify([...current]));
  return current;
}
