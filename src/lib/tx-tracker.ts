// Persistent transaction tracking — survives reloads so no hash is ever lost.
// Browser-only: every access is guarded.

export type TrackedTxStatus = "pending" | "success" | "failed" | "uncertain";

export interface TrackedTx {
  hash: string;
  label: string;
  status: TrackedTxStatus;
  detail?: string;
  createdAt: number;
  updatedAt: number;
}

const KEY = "gendare.transactions.v1";
const MAX = 40;

const listeners = new Set<(txs: TrackedTx[]) => void>();

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getTrackedTxs(): TrackedTx[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TrackedTx[]) : [];
  } catch {
    return [];
  }
}

function write(txs: TrackedTx[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(txs.slice(0, MAX)));
  } catch {
    /* storage full or unavailable — tracking is best-effort */
  }
  listeners.forEach((fn) => fn(txs));
}

/** Record a hash the instant it exists, before any waiting happens. */
export function trackTx(hash: string, label: string): void {
  if (!hash) return;
  const now = Date.now();
  const existing = getTrackedTxs().filter((t) => t.hash !== hash);
  write([{ hash, label, status: "pending", createdAt: now, updatedAt: now }, ...existing]);
}

export function updateTx(hash: string, status: TrackedTxStatus, detail?: string): void {
  if (!hash) return;
  const txs = getTrackedTxs().map((t) =>
    t.hash === hash ? { ...t, status, detail, updatedAt: Date.now() } : t,
  );
  write(txs);
}

export function subscribeTxs(fn: (txs: TrackedTx[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const EXPLORER_TX_BASE = "https://explorer-studio-dev.genlayer.com/tx/";

export function explorerTxUrl(hash: string) {
  return `${EXPLORER_TX_BASE}${hash}`;
}
