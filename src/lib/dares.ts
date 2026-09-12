import type { OnchainDare, OnchainReceipt } from "./contract";
import { weiToGen, microUsdToUsd } from "./contract";

export const COIN_DISPLAY_NAMES: Record<string, string> = {
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  solana: "Solana",
  genlayer: "GenLayer",
  binancecoin: "BNB",
  ripple: "XRP",
};

export function coinDisplayName(coinId: string | undefined): string {
  if (!coinId) return "";
  return COIN_DISPLAY_NAMES[coinId] ?? coinId.charAt(0).toUpperCase() + coinId.slice(1);
}

export type DareStatus =
  | "open"
  | "submitted"
  | "retryable"
  | "complete"
  | "incomplete"
  | "refundable"
  | "canceled"
  | "void";
export type DareCategory = "Price" | "Building" | "Writing" | "Onchain";
export type DareType = "price" | "goal";
export type DareVerdict = "complete" | "incomplete" | "inconclusive" | "unreadable" | "canceled";
export type DareReceipt = OnchainReceipt & { raw?: string };

export interface Dare {
  id: string;
  goal: string;
  category: DareCategory;
  creator: string;
  creatorRaw?: string;
  stake: number;
  supporters: number;
  challengers: number;
  supporterCount: number;
  challengerCount: number;
  deadline: number;
  status: DareStatus;
  isPublic: boolean;
  evidenceUrl?: string;
  decision?: string;
  verdict?: DareVerdict;
  receiptSummary?: string;
  createdAt: number;
  pending?: boolean;
  dareType: DareType;
  coinId?: string;
  /** Display value in USD, derived from integer micro-USD onchain. */
  targetPrice?: number;
  targetPriceMicroUsd?: string;
  condition?: "above_at_deadline" | "reached_anytime";
  claimantIdentity?: string;
  completionCriteria?: string;
  evidenceHint?: string;
  receipt?: DareReceipt;
  settlementMode?: string;
  attempts?: number;
  evidenceLockedAt?: number;
  settledAt?: number;
}

const VALID_STATUS: DareStatus[] = [
  "open",
  "submitted",
  "retryable",
  "complete",
  "incomplete",
  "refundable",
  "canceled",
  "void",
];
const VALID_CATEGORIES: DareCategory[] = ["Price", "Building", "Writing", "Onchain"];

function normStatus(s: string): DareStatus {
  const lower = (s ?? "").toLowerCase();
  return (VALID_STATUS.find((x) => x === lower) ?? "void") as DareStatus;
}

function normCategory(c: string, isPrice: boolean): DareCategory {
  if (isPrice) return "Price";
  return (VALID_CATEGORIES.find((x) => x === c) ?? "Building") as DareCategory;
}

function shortAddr(a: string) {
  if (!a || a.length < 10) return a || "0x…";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function normalizeReceipt(value: OnchainDare["receipt"]): DareReceipt | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return { raw: String(value) };

  const raw = value.trim();
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as DareReceipt;
    }
  } catch {
    // Older deployments may expose a plain-text receipt. Preserve it safely.
  }
  return { raw };
}

export function formatReceipt(receipt: DareReceipt): string {
  try {
    return JSON.stringify(
      receipt,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    );
  } catch {
    return receipt.raw ?? "Receipt could not be formatted";
  }
}

export function adaptOnchain(d: OnchainDare): Dare {
  const status = normStatus(d.status);
  const dareType: DareType = d.dare_type === "price" || d.category === "Price" ? "price" : "goal";
  const receipt = normalizeReceipt(d.receipt);
  const normalizedDecision = String(d.decision ?? receipt?.decision ?? "").toLowerCase();
  const verdict = ["complete", "incomplete", "inconclusive", "unreadable", "canceled"].includes(
    normalizedDecision,
  )
    ? (normalizedDecision as DareVerdict)
    : undefined;
  const receiptSummary =
    typeof receipt?.summary === "string" && receipt.summary.trim() ? receipt.summary : undefined;
  return {
    id: String(d.id),
    goal: d.goal,
    category: normCategory(d.category, dareType === "price"),
    creator: shortAddr(d.darer),
    creatorRaw: d.darer,
    stake: weiToGen(d.darer_stake),
    supporters: weiToGen(d.supporter_pool),
    challengers: weiToGen(d.challenger_pool),
    supporterCount: d.supporters?.length ?? 0,
    challengerCount: d.challengers?.length ?? 0,
    deadline: d.deadline,
    status,
    isPublic: d.is_public === true,
    evidenceUrl: d.evidence_url,
    decision: d.decision,
    verdict,
    receiptSummary,
    createdAt: d.created_at ? d.created_at * 1_000 : 0,
    dareType,
    coinId: d.coin_id,
    targetPrice: microUsdToUsd(d.target_price_microusd),
    targetPriceMicroUsd:
      d.target_price_microusd !== undefined ? String(d.target_price_microusd) : undefined,
    condition: d.condition as Dare["condition"],
    claimantIdentity: d.claimant_identity,
    completionCriteria: d.completion_criteria,
    evidenceHint: d.evidence_hint,
    receipt,
    settlementMode: d.settlement_mode,
    attempts: d.attempts,
    evidenceLockedAt: d.evidence_locked_at ? d.evidence_locked_at * 1_000 : undefined,
    settledAt: d.settled_at ? d.settled_at * 1_000 : undefined,
  };
}
