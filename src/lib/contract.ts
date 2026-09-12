import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import type { CalldataEncodable } from "genlayer-js/types";
import { isAddress, parseUnits } from "viem";
import type { Account } from "viem";
import {
  getInjectedProvider,
  STUDIO_DEV_CHAIN_ID_HEX,
  switchOrAddStudioDev,
  type Eip1193Provider,
} from "./injected";
import { trackTx, updateTx } from "./tx-tracker";

export const CONTRACT_ADDRESS = "0x5eA37668c8c8F1313d4294C349a7eC8585071135" as `0x${string}`;

if (!isAddress(CONTRACT_ADDRESS)) {
  throw new Error(`Invalid contract address configured: ${CONTRACT_ADDRESS}`);
}

let client: ReturnType<typeof createClient> | null = null;
let clientAddress: string | null = null;
let clientProvider: Eip1193Provider | null = null;

// Read-only client — no wallet needed
const readClient = createClient({
  chain: studioDevnet,
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
    chain: studioDevnet,
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

async function ensureStudioDevChain(provider: Eip1193Provider) {
  const current = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
  if (current !== STUDIO_DEV_CHAIN_ID_HEX) await switchOrAddStudioDev(provider);
  const confirmed = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
  if (confirmed !== STUDIO_DEV_CHAIN_ID_HEX) {
    throw new Error(`Wallet must be connected to Studio Devnet (${STUDIO_DEV_CHAIN_ID_HEX})`);
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
  await ensureStudioDevChain(provider);

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
    const decided = await c.waitForDecision({ hash: hash as never, interval: 5_000, retries: 120 });
    if (isSuccessful(decided)) {
      updateTx(hash, "success");
      return { hash, success: true };
    }
    const detail = String((decided as { status?: unknown })?.status ?? "not successful");
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
  // v2.1.2 goal-dare fields
  claimant_identity?: string;
  completion_criteria?: string;
  evidence_hint?: string;
  // v2.1.2 settlement fields
  receipt?: OnchainReceipt | string | null;
  settlement_mode?: string;
  attempts?: number;
  evidence_locked_at?: number;
  settled_at?: number;
  // price dare (v2.1.2)
  dare_type?: string;
  coin_id?: string;
  target_price_microusd?: string | number;
  condition?: string;
};

// ─── READ ───────────────────────────────────────────

export async function getDareCount(): Promise<number> {
  const c = await getReadClient();
  const result = await c.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_dare_count",
    args: [],
  });
  return Number(result);
}

export async function getDare(dareId: number): Promise<OnchainDare> {
  const c = await getReadClient();
  const result = await c.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_dare",
    args: [dareId],
  });
  return JSON.parse(String(result)) as OnchainDare;
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
  const count = await getDareCount();
  const dares: OnchainDare[] = [];
  for (let i = 0; i < count; i++) {
    try {
      dares.push(await getDare(i));
    } catch {
      // Skip sparse or temporarily unreadable IDs without hiding valid dares.
    }
  }
  return dares;
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
 * v2.1.2: create_dare(goal, claimant_identity, completion_criteria, deadline,
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
 * v2.1.2: create_price_dare(coin_id, target_price_microusd, condition,
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
