import { createTransactionKit, type TrackedStatus } from "@genlayer/transaction-kit";
import { createClient } from "genlayer-js";
import type { CalldataEncodable } from "genlayer-js/types";
import { isAddress, parseUnits } from "viem";
import type { Account } from "viem";
import {
  getInjectedProvider,
  STUDIO_NEXT_CHAIN_ID_HEX,
  switchOrAddStudioNext,
  type Eip1193Provider,
} from "./injected";
import { STUDIO_NEXT_CHAIN } from "./network";
import { trackTx, updateTx } from "./tx-tracker";

export const CONTRACT_ADDRESS = "0x86aC73EaDe7563B2c67a9bfD06E6D59AE0CA3980" as `0x${string}`;
export const RETRY_COOLDOWN_SECONDS = 30 * 60;

if (!isAddress(CONTRACT_ADDRESS)) {
  throw new Error(`Invalid contract address configured: ${CONTRACT_ADDRESS}`);
}

let client: ReturnType<typeof createClient> | null = null;
let clientAddress: string | null = null;
let clientProvider: Eip1193Provider | null = null;

// Read-only client — no wallet needed
const readClient = createClient({
  chain: STUDIO_NEXT_CHAIN,
});

async function getReadClient() {
  return readClient;
}

/**
 * Build a signing client bound to the connected wallet.
 * The injected EIP-1193 provider is handed to the SDK directly — we never call
 * `client.connect()` (that path probes MetaMask Snaps and breaks Rabby).
 */
export function getClient(walletAddress: string) {
  const provider = getInjectedProvider();
  client = createClient({
    chain: STUDIO_NEXT_CHAIN,
    account: walletAddress as `0x${string}`,
    ...(provider ? { provider: provider as never } : {}),
  });
  clientAddress = walletAddress;
  clientProvider = provider;
  return client;
}

function ensureClient() {
  if (!client || !clientAddress || !clientProvider) throw new Error("Connect wallet first");
  return { c: client, account: clientAddress as `0x${string}`, provider: clientProvider };
}

type ErrorRecord = {
  message?: unknown;
  shortMessage?: unknown;
  details?: unknown;
  data?: unknown;
  cause?: unknown;
  code?: unknown;
};

function decodeRpcResult(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const decoded = globalThis.atob(value);
    const readable = decoded.replace(/[^\x20-\x7E\n\r\t]/g, "").trim();
    return readable || value;
  } catch {
    return value;
  }
}

function printable(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value === null || value === undefined) return null;
  try {
    const json = JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    );
    return json && json !== "{}" ? json : null;
  } catch {
    return String(value);
  }
}

export function getTransactionErrorMessage(error: unknown): string {
  const specific: string[] = [];
  const fallback: string[] = [];
  let current: unknown = error;
  let depth = 0;
  while (current && depth < 6) {
    const record = current as ErrorRecord;
    const data = record.data as { receipt?: { result?: unknown }; message?: unknown } | undefined;
    for (const value of [decodeRpcResult(data?.receipt?.result), data?.message]) {
      const text = printable(value);
      if (text && !specific.includes(text)) specific.push(text);
    }
    for (const value of [record.details, record.shortMessage, record.message]) {
      const text = printable(value);
      if (text && !fallback.includes(text)) fallback.push(text);
    }
    current = record.cause;
    depth += 1;
  }
  return specific[0] ?? fallback[0] ?? "Transaction failed";
}

function debugTransactionError(error: unknown, request: unknown) {
  if (!import.meta.env.DEV) return;
  const record = error as ErrorRecord;
  console.error("GenLayer write failed", {
    shortMessage: record?.shortMessage,
    details: record?.details,
    data: record?.data,
    cause: record?.cause,
    request,
  });
}

async function ensureStudioNextChain(provider: Eip1193Provider) {
  const current = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
  if (current !== STUDIO_NEXT_CHAIN_ID_HEX) await switchOrAddStudioNext(provider);
  const confirmed = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
  if (confirmed !== STUDIO_NEXT_CHAIN_ID_HEX) {
    throw new Error(`Wallet must be connected to Studio Next (${STUDIO_NEXT_CHAIN_ID_HEX})`);
  }
}

export type TxOutcome = {
  hash: string;
  /** True only when the transaction was decided AND executed successfully. */
  success: boolean;
  /** Present when the outcome is not a clean success. */
  detail?: string;
};

/**
 * Every write goes through here:
 *   1. estimate fees for the exact same call
 *   2. submit with the estimated distribution / allocations / feeValue
 *   3. persist the hash immediately
 *   4. wait for the decision and confirm execution succeeded
 * A non-successful or undetermined outcome is returned, not thrown, so the
 * transaction stays trackable.
 */
async function sendWrite(
  label: string,
  functionName: string,
  args: CalldataEncodable[],
  value: bigint,
  options?: { skipSimulatedEstimate?: boolean },
): Promise<TxOutcome> {
  const { c, account, provider } = ensureClient();

  // Re-check the same injected provider immediately before estimating and signing.
  await ensureStudioNextChain(provider);

  // genlayer-js resolves the sender via account?.address — a bare hex string
  // yields undefined and viem throws 'Address "undefined" is invalid'. Pass an
  // explicit JSON-RPC account object, never a string and never a spread that
  // could carry an undefined account/address.
  const signerAccount = { address: account, type: "json-rpc" } as Account;
  if (!signerAccount.address) throw new Error("Connect wallet first");

  // Fee estimate and submission share the exact same account/address/function/args/value.
  const call = {
    account: signerAccount,
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
  };

  let hash: `0x${string}`;
  try {
    // Studio Next's simulated write estimate (gen_call) omits the real
    // transaction timestamp and falsely trips time-based contract checks for
    // create_dare / create_price_dare. For those paths only, use the active
    // fee policy without executing the contract.
    const recommended = options?.skipSimulatedEstimate
      ? await c.estimateTransactionFees()
      : await c.estimateTransactionFeesForWrite(call);
    hash = (await c.writeContract({
      account: signerAccount,
      address: CONTRACT_ADDRESS,
      functionName,
      args,
      value,
      fees: {
        distribution: recommended.distribution,
        messageAllocations: recommended.messageAllocations,
        feeValue: recommended.feeValue,
      },
    })) as `0x${string}`;
  } catch (error) {
    debugTransactionError(error, call);
    const wrapped = new Error(getTransactionErrorMessage(error)) as Error & ErrorRecord;
    wrapped.cause = error;
    throw wrapped;
  }

  // Persist before waiting — a reload or timeout must never lose the hash.
  trackTx(hash, label);

  try {
    // RC2 normalizes consensus phase and execution result. A transaction is a
    // success only when GenLayer reports a successful execution, never merely
    // because consensus accepted or finalized it.
    const kit = createTransactionKit({
      chain: STUDIO_NEXT_CHAIN,
      provider: provider as never,
      account,
    });
    const decided = await kit.track(
      hash,
      (status: TrackedStatus) => {
        if (status.successful !== undefined) return;
        const detail = [status.statusName, status.executionResultName].filter(Boolean).join(" / ");
        if (detail) updateTx(hash, "pending", detail);
      },
      { until: "decided" },
    );
    if (decided.successful === true) {
      updateTx(hash, "success");
      return { hash, success: true };
    }
    const detail =
      [decided.statusName, decided.executionResultName].filter(Boolean).join(" / ") ||
      "Consensus decided without a successful contract execution";
    const recoverableDecision = ["UNDETERMINED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(
      decided.statusName ?? "",
    );
    if (recoverableDecision) {
      // These decisions can be appealed/reactivated under GenLayer consensus.
      // Preserve the original hash as uncertain so users do not submit a
      // duplicate transaction while the same lifecycle may still recover.
      updateTx(hash, "uncertain", detail);
      return { hash, success: false, detail };
    }
    updateTx(hash, "failed", detail);
    return { hash, success: false, detail };
  } catch (err) {
    const detail = (err as Error)?.message ?? "decision not observed";
    updateTx(hash, "uncertain", detail);
    return { hash, success: false, detail };
  }
}

export type OnchainReceipt = {
  decision?: string;
  reason_code?: string;
  summary?: string;
  observed_at?: string | number;
  [key: string]: unknown;
};

export type OnchainDare = {
  id: number;
  darer: string;
  goal: string;
  deadline: number;
  created_at?: number;
  category: string;
  is_public: boolean;
  darer_stake: string;
  challenger_pool: string;
  supporter_pool: string;
  status: string;
  decision?: string;
  evidence_url?: string;
  evidence_text?: string;
  challengers: { address: string; stake: number | string }[];
  supporters: { address: string; stake: number | string }[];
  // v2.2.0 goal-dare fields
  claimant_identity?: string;
  completion_criteria?: string;
  evidence_hint?: string;
  // v2.2.0 settlement fields
  receipt?: OnchainReceipt | string | null;
  settlement_mode?: string;
  attempts?: number;
  last_attempt_at?: number;
  evidence_locked_at?: number;
  settled_at?: number;
  // price dare (v2.2.0)
  dare_type?: string;
  coin_id?: string;
  target_price_microusd?: string | number;
  condition?: string;
};

// ─── READ ───────────────────────────────────────────

const READ_RETRY_DELAY_MS = 900;

export class DareNotFoundError extends Error {
  readonly dareId: number;

  constructor(dareId: number) {
    super(`Dare ${dareId} does not exist`);
    this.name = "DareNotFoundError";
    this.dareId = dareId;
  }
}

export class ContractReadUnavailableError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "ContractReadUnavailableError";
    this.cause = cause;
  }
}

export function isDareNotFoundError(error: unknown): error is DareNotFoundError {
  return error instanceof DareNotFoundError;
}

function errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  let depth = 0;
  while (current && depth < 6) {
    if (typeof current === "string") {
      parts.push(current);
      break;
    }
    const record = current as ErrorRecord;
    const data = record.data as { receipt?: { result?: unknown }; message?: unknown } | undefined;
    for (const value of [
      decodeRpcResult(data?.receipt?.result),
      data?.message,
      record.message,
      record.shortMessage,
      record.details,
      record.data,
    ]) {
      const text = printable(value);
      if (text) parts.push(text);
    }
    current = record.cause;
    depth += 1;
  }
  return parts.join(" ").toLowerCase();
}

function isExplicitMissingDare(error: unknown): boolean {
  const text = errorText(error);
  return text.includes("dare does not exist") || text.includes("dare not found");
}

async function waitBeforeReadRetry(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, READ_RETRY_DELAY_MS));
}

/** One bounded retry absorbs a transient RPC miss without creating a request storm. */
async function readWithRetry<T>(read: () => Promise<T>, stopRetry?: (error: unknown) => boolean) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      lastError = error;
      if (stopRetry?.(error) || attempt === 1) throw error;
      await waitBeforeReadRetry();
    }
  }
  throw lastError;
}

function parseOnchainDare(value: unknown): OnchainDare {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Contract returned an invalid dare record");
  }
  return parsed as OnchainDare;
}

export async function getDareCount(): Promise<number> {
  const c = await getReadClient();
  try {
    const result = await readWithRetry(() =>
      c.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_dare_count",
        args: [],
      }),
    );
    return Number(result);
  } catch (error) {
    throw new ContractReadUnavailableError("Studio Next could not be reached.", error);
  }
}

export async function getDare(dareId: number): Promise<OnchainDare> {
  if (!Number.isSafeInteger(dareId) || dareId < 0) throw new DareNotFoundError(dareId);
  const c = await getReadClient();
  try {
    const result = await readWithRetry(
      () =>
        c.readContract({
          address: CONTRACT_ADDRESS,
          functionName: "get_dare",
          args: [dareId],
        }),
      isExplicitMissingDare,
    );
    return parseOnchainDare(result);
  } catch (error) {
    if (isExplicitMissingDare(error)) throw new DareNotFoundError(dareId);
    throw new ContractReadUnavailableError("This dare could not be read from Studio Next.", error);
  }
}

export async function getClaimable(dareId: number, account: string): Promise<bigint> {
  const c = await getReadClient();
  const result = await c.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_claimable",
    args: [dareId, account],
  });
  return BigInt(result as string | number | bigint);
}

export async function getAllDares(): Promise<OnchainDare[]> {
  const c = await getReadClient();
  try {
    // The deployed contract returns its latest 20 records in one read. The old
    // count + N-reads implementation exhausted Studio Next's hourly quota and
    // silently converted transport failures into an empty feed.
    const result = await readWithRetry(() =>
      c.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_recent_dares",
        args: [20],
      }),
    );
    const values: unknown = typeof result === "string" ? JSON.parse(result) : result;
    if (!Array.isArray(values)) throw new Error("Contract returned an invalid dare list");
    return values.map(parseOnchainDare);
  } catch (error) {
    throw new ContractReadUnavailableError(
      "The dare feed could not be read from Studio Next.",
      error,
    );
  }
}

// ─── WRITE ──────────────────────────────────────────

function genToWei(gen: string | number): bigint {
  const stake = String(gen).trim();
  if (!/^\d+(\.\d+)?$/.test(stake)) throw new Error("Enter a valid GEN stake");
  return parseUnits(stake, 18);
}

/** Contract accepts integer micro-USD. Max supported target: 1e9 USD. */
export const MAX_TARGET_MICROUSD = 1_000_000_000_000_000n;

/**
 * Deterministic USD string -> integer micro-USD bigint.
 * "1" -> 1000000n, "0.125" -> 125000n. No floats, no exponents.
 */
export function usdToMicroUsd(input: string): bigint {
  const raw = (input ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,6})?$/.test(raw)) {
    throw new Error("Enter a plain positive price with at most 6 decimals (e.g. 0.125 or 150000)");
  }
  const [whole, frac = ""] = raw.split(".");
  const micro = BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, "0"));
  if (micro <= 0n) throw new Error("Target price must be greater than zero");
  if (micro > MAX_TARGET_MICROUSD) throw new Error("Target price is outside the supported range");
  return micro;
}

export function microUsdToUsd(micro: string | number | bigint | undefined): number | undefined {
  if (micro === undefined || micro === null) return undefined;
  try {
    return Number(BigInt(micro)) / 1_000_000;
  } catch {
    return undefined;
  }
}

/**
 * v2.2.0: create_dare(goal, claimant_identity, completion_criteria, deadline,
 *                     evidence_hint, category, is_public) payable
 */
export async function createDare(
  goal: string,
  claimantIdentity: string,
  completionCriteria: string,
  deadlineDate: Date,
  evidenceHint: string,
  category: string,
  isPublic: boolean,
  stakeGEN: string | number,
) {
  const deadline = Math.floor(deadlineDate.getTime() / 1000);
  return sendWrite(
    "Create dare",
    "create_dare",
    [goal, claimantIdentity, completionCriteria, deadline, evidenceHint, category, isPublic],
    genToWei(stakeGEN),
    { skipSimulatedEstimate: true },
  );
}

export async function challengeDare(dareId: number, stakeGEN: string | number) {
  return sendWrite("Challenge dare", "challenge_dare", [dareId], genToWei(stakeGEN));
}

export async function supportDare(dareId: number, stakeGEN: string | number) {
  return sendWrite("Support dare", "support_dare", [dareId], genToWei(stakeGEN));
}

export async function submitEvidence(dareId: number, evidenceUrl: string, evidenceText: string) {
  return sendWrite(
    "Submit evidence",
    "submit_evidence",
    [dareId, evidenceUrl, evidenceText],
    BigInt(0),
  );
}

export async function resolveDare(dareId: number) {
  return sendWrite("Resolve dare", "resolve_dare", [dareId], BigInt(0));
}

export async function claimAbandoned(dareId: number) {
  return sendWrite("Claim abandoned", "claim_abandoned", [dareId], BigInt(0));
}

export async function forceRefundStalled(dareId: number) {
  return sendWrite("Force refund stalled", "force_refund_stalled", [dareId], BigInt(0));
}

export async function cancelOpenDare(dareId: number) {
  return sendWrite("Cancel open dare", "cancel_open_dare", [dareId], BigInt(0));
}

export async function claim(dareId: number) {
  return sendWrite("Claim", "claim", [dareId], BigInt(0));
}

/**
 * v2.2.0: create_price_dare(coin_id, target_price_microusd, condition,
 *                           deadline, is_public) payable
 */
export async function createPriceDare(
  coinId: string,
  targetPriceMicroUsd: bigint,
  condition: "above_at_deadline" | "reached_anytime",
  deadlineDate: Date,
  isPublic: boolean,
  stakeGEN: string | number,
) {
  const deadline = Math.floor(deadlineDate.getTime() / 1000);
  return sendWrite(
    "Create price dare",
    "create_price_dare",
    [coinId, targetPriceMicroUsd, condition, deadline, isPublic],
    genToWei(stakeGEN),
    { skipSimulatedEstimate: true },
  );
}

export async function resolvePriceDare(dareId: number) {
  return sendWrite("Check price", "resolve_price_dare", [dareId], BigInt(0));
}

export function weiToGen(wei: string | bigint | number): number {
  try {
    const n = typeof wei === "bigint" ? wei : BigInt(wei);
    return Number(n / 10n ** 14n) / 10_000;
  } catch {
    return 0;
  }
}
