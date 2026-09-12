import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { StatusBadge } from "@/components/StatusBadge";
import {
  adaptOnchain,
  type Dare,
  coinDisplayName,
  formatReceipt,
  parseDareRouteId,
} from "@/lib/dares";
import {
  cancelOpenDare,
  claim as claimPayout,
  claimAbandoned,
  forceRefundStalled,
  getDare,
  getClaimable,
  isDareNotFoundError,
  supportDare,
  challengeDare,
  submitEvidence,
  resolveDare,
  resolvePriceDare,
  weiToGen,
  type OnchainDare,
} from "@/lib/contract";
import { useWallet, STUDIO_DEV_CHAIN_ID_HEX, shortAddress } from "@/lib/wallet";
import { useCountdown } from "@/lib/countdown";

export const Route = createFileRoute("/dare/$id")({
  component: DareDetail,
  head: () => ({
    meta: [
      { title: "Dare settlement — GenDare" },
      {
        name: "description",
        content:
          "Onchain dare detail: stake positions, evidence and validator settlement on GenLayer Studio Devnet.",
      },
      { property: "og:title", content: "Dare settlement — GenDare" },
      {
        property: "og:description",
        content:
          "Onchain dare detail: stake positions, evidence and validator settlement on GenLayer Studio Devnet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-white">Dare not found</h1>
        <Link to="/" className="mt-4 inline-block text-electric">
          Back to feed
        </Link>
      </div>
    </div>
  ),
});

/* ── primitives ─────────────────────────────────────── */

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-white/[0.07] bg-white/[0.015] p-6 sm:p-8 ${className}`}
    >
      {children}
    </section>
  );
}

function formatDeadline(ts: number) {
  try {
    return new Date(ts * 1000).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

function PositionsBar({ support, challenge }: { support: number; challenge: number }) {
  const total = support + challenge;
  if (total <= 0) {
    return (
      <div>
        <div className="h-1.5 w-full rounded-full bg-white/[0.06]" />
        <div className="mt-3 text-[12.5px] text-muted-foreground">No positions yet.</div>
      </div>
    );
  }
  const sPct = (support / total) * 100;
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between text-[10.5px] uppercase tracking-[0.18em]">
        <span className="text-lime tabular-nums">{Math.round(sPct)}% support</span>
        <span className="text-deep-red tabular-nums">{Math.round(100 - sPct)}% challenge</span>
      </div>
      <div className="relative flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${sPct}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="h-full bg-lime"
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${100 - sPct}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="h-full bg-deep-red/80"
        />
      </div>
    </div>
  );
}

function ParticipantList({
  label,
  list,
  side,
}: {
  label: string;
  list: { address: string; stake: number | string }[];
  side: "support" | "challenge";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label} · {list.length}
      </div>
      <div className="mt-3">
        {list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/[0.08] px-3 py-4 text-[12px] text-muted-foreground">
            {side === "support" ? "No supporters yet." : "No challengers yet."}
          </div>
        ) : (
          list.map((p, i) => (
            <div
              key={`${p.address}-${i}`}
              className="flex items-center justify-between border-b border-white/[0.05] py-2.5 last:border-b-0"
            >
              <span className="font-mono text-[12px] text-white/80">{shortAddress(p.address)}</span>
              <span
                className={`font-mono text-[12px] tabular-nums ${side === "support" ? "text-lime" : "text-deep-red"}`}
              >
                {weiToGen(p.stake)} GEN
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Timeline({ dare }: { dare: Dare }) {
  const past = dare.deadline * 1000 < Date.now();
  const settled = ["complete", "incomplete", "refundable", "canceled", "void"].includes(
    dare.status,
  );
  const step = settled ? 3 : ["submitted", "retryable"].includes(dare.status) ? 2 : past ? 1 : 0;
  const steps = [
    "OPEN",
    dare.dareType === "price" ? "DEADLINE" : "EVIDENCE / DEADLINE",
    "VALIDATOR CONSENSUS",
    "SETTLED",
  ];
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <li key={s} className="flex items-center gap-3">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                active ? "bg-lime" : done ? "bg-white/40" : "bg-white/[0.15]"
              }`}
            />
            <span
              className={`text-[11px] tracking-[0.18em] ${
                active ? "text-white" : done ? "text-white/60" : "text-muted-foreground"
              }`}
            >
              {s}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

type Action =
  | "idle"
  | "support"
  | "challenge"
  | "evidence"
  | "resolve"
  | "price-resolve"
  | "claim"
  | "abandon"
  | "cancel"
  | "force-refund";

/* ── page ───────────────────────────────────────────── */

function DareDetail() {
  const { id } = Route.useParams();
  const routeTarget = parseDareRouteId(id);
  const chainDareId = routeTarget?.dareId ?? -1;
  const wallet = useWallet();
  const [raw, setRaw] = useState<OnchainDare | null>(null);
  const [dare, setDare] = useState<Dare | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Action>("idle");
  const [showEvidence, setShowEvidence] = useState(false);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [stakeAmount, setStakeAmount] = useState(10);
  const [claimableWei, setClaimableWei] = useState(0n);
  const [now, setNow] = useState(() => Date.now());

  const load = async () => {
    setLoading(true);
    setMissing(false);
    setLoadError(null);
    if (!routeTarget) {
      setRaw(null);
      setDare(null);
      setMissing(true);
      setLoading(false);
      return;
    }
    try {
      const onchain = await getDare(chainDareId);
      const adapted = adaptOnchain(onchain);
      if (routeTarget.dareType && routeTarget.dareType !== adapted.dareType) {
        setRaw(null);
        setDare(null);
        setMissing(true);
        return;
      }
      let nextClaimable = 0n;
      if (wallet.address && onchain.settlement_mode) {
        try {
          nextClaimable = await getClaimable(chainDareId, wallet.address);
        } catch {
          // A read failure must not hide the dare itself. The user can retry on refresh.
        }
      }
      setRaw(onchain);
      setDare(adapted);
      setClaimableWei(nextClaimable);
    } catch (err) {
      console.error(err);
      if (isDareNotFoundError(err)) {
        setRaw(null);
        setDare(null);
        setMissing(true);
      } else {
        setLoadError(
          "Studio Devnet is busy or temporarily unavailable. Your dare is still onchain.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setRaw(null);
    setDare(null);
    setClaimableWei(0n);
    void load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [id, wallet.address]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const ensureChain = async () => {
    if (!wallet.address) await wallet.connect();
    if (wallet.chainId && wallet.chainId !== STUDIO_DEV_CHAIN_ID_HEX) {
      const ok = await wallet.switchToStudioDev();
      if (!ok) return false;
    }
    return true;
  };

  const runAction = async (
    kind: Action,
    fn: () => Promise<{ hash: string; success: boolean; detail?: string }>,
  ) => {
    try {
      setPending(kind);
      if (!(await ensureChain())) return;
      const outcome = await fn();
      if (!outcome.success) {
        toast.error(
          `Transaction not confirmed — still tracking (${outcome.detail ?? "undetermined"})`,
        );
        return;
      }
      toast.success("Transaction executed");
      await load();
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4001) toast.error("Transaction rejected");
      else toast.error((err as Error)?.message ?? "Transaction failed");
    } finally {
      setPending("idle");
    }
  };

  if (loading && (!dare || !raw)) {
    return (
      <div className="relative min-h-screen">
        <AmbientBackground />
        <Navbar />
        <div className="relative z-10 mx-auto max-w-5xl px-5 pt-20 sm:px-6 sm:pt-28">
          <div className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
          <div className="mt-6 h-8 w-3/4 animate-pulse rounded bg-white/[0.06]" />
          <div className="mt-10 grid gap-4 lg:grid-cols-[1.85fr_1fr]">
            <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
            <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
          </div>
        </div>
      </div>
    );
  }

  if (missing) throw notFound();

  if (!dare || !raw) {
    return (
      <div className="relative min-h-screen">
        <AmbientBackground />
        <Navbar />
        <main className="relative z-10 mx-auto flex min-h-[75vh] max-w-xl items-center px-5 py-24 text-center sm:px-6">
          <div className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 sm:p-10">
            <div className="eyebrow">Network read interrupted</div>
            <h1 className="mt-5 text-2xl font-semibold text-white">The dare is still onchain.</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {loadError ?? "Studio Devnet did not return the record. Try the read again."}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="min-h-11 rounded-md bg-lime px-5 text-[11px] font-bold tracking-[0.08em] text-background disabled:opacity-60"
              >
                {loading ? "RETRYING…" : "RETRY READ"}
              </button>
              <Link
                to="/"
                className="inline-flex min-h-11 items-center rounded-md border border-white/15 px-5 text-[11px] font-bold tracking-[0.08em] text-white"
              >
                BACK TO FEED
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const isPrice = dare.dareType === "price";
  const coinName = coinDisplayName(dare.coinId);
  const heroHeadline = isPrice
    ? dare.condition === "reached_anytime"
      ? `${coinName} will reach $${dare.targetPrice?.toLocaleString()} before the deadline.`
      : `${coinName} will be recorded at or above $${dare.targetPrice?.toLocaleString()} near the deadline.`
    : dare.goal;
  const connected = wallet.address?.toLowerCase();
  const isCreator = !!connected && connected === raw.darer.toLowerCase();
  const totalPool = dare.supporters + dare.challengers;
  const deadlinePassed = dare.deadline * 1000 <= now;
  const isOpen = dare.status === "open";
  const marketOpen = ["open", "submitted"].includes(dare.status) && !deadlinePassed;
  const priceSettlementAt = dare.deadline + 10 * 60;
  const priceSettlementOpen = now >= priceSettlementAt * 1_000;
  const attemptsRemaining = (dare.attempts ?? 0) < 3;

  const mySupport = raw.supporters.find((p) => p.address?.toLowerCase() === connected);
  const myChallenge = raw.challengers.find((p) => p.address?.toLowerCase() === connected);
  const myPosition = mySupport
    ? { side: "Support" as const, amount: weiToGen(mySupport.stake) }
    : myChallenge
      ? { side: "Challenge" as const, amount: weiToGen(myChallenge.stake) }
      : null;

  const positionBaseDisabled = pending !== "idle" || isCreator || !marketOpen;
  const supportDisabled =
    positionBaseDisabled || !!myChallenge || (!mySupport && raw.supporters.length >= 32);
  const challengeDisabled =
    positionBaseDisabled || !!mySupport || (!myChallenge && raw.challengers.length >= 32);
  const canSubmitEvidence = !isPrice && isCreator && isOpen && !deadlinePassed;
  const canResolveGoal =
    !isPrice &&
    ["submitted", "retryable"].includes(dare.status) &&
    deadlinePassed &&
    attemptsRemaining;
  const canResolvePrice =
    isPrice &&
    ["open", "retryable"].includes(dare.status) &&
    priceSettlementOpen &&
    attemptsRemaining;
  const canFinalizeAbandoned = !isPrice && isOpen && deadlinePassed;
  const canCancel = isCreator && isOpen && dare.supporters === 0 && dare.challengers === 0;
  const stalledRefundAt = isPrice ? priceSettlementAt + 24 * 60 * 60 : dare.deadline + 24 * 60 * 60;
  const stalledStatus = isPrice
    ? ["open", "retryable"].includes(dare.status)
    : ["submitted", "retryable"].includes(dare.status);
  const canForceRefund = stalledStatus && now >= stalledRefundAt * 1_000;
  const claimableGen = weiToGen(claimableWei);
  const canClaim = claimableWei > 0n;
  const showSettlementActions = canClaim || canCancel || canFinalizeAbandoned || stalledStatus;

  const verdictCopy =
    dare.status === "refundable"
      ? "Consensus produced no winner. Every participant can reclaim their original stake."
      : dare.status === "canceled"
        ? "This unjoined dare was canceled. The creator can reclaim the locked stake."
        : dare.status === "retryable"
          ? "The latest validator result was inconclusive or unreadable. Another resolution attempt is available."
          : isPrice && isOpen
            ? "Settlement opens 10 minutes after the deadline. GenLayer validators evaluate the locked CoinGecko time window."
            : !isPrice && isOpen
              ? "The claimant submits evidence before the deadline. GenLayer validators then review it against the completion criteria."
              : null;

  return (
    <div className="relative min-h-screen">
      <AmbientBackground />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-5xl px-5 pb-24 pt-20 sm:px-6 sm:pt-28">
        {loadError && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-stake/25 bg-amber-stake/[0.06] px-4 py-3 text-[11.5px] text-white/75">
            <span>{loadError} Showing the last confirmed record.</span>
            <button
              type="button"
              onClick={() => void load()}
              className="font-semibold text-amber-stake"
            >
              Retry read
            </button>
          </div>
        )}
        {/* top bar */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px]">
          <Link to="/" className="text-muted-foreground transition-colors hover:text-white">
            ← Back to feed
          </Link>
          <span className="text-white/15">/</span>
          <span className="font-mono text-white">DARE #{dare.id}</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9.5px] tracking-[0.18em] text-muted-foreground">
            {isPrice ? "PRICE" : "GOAL"}
          </span>
          <StatusBadge status={dare.status} />
        </div>

        {/* hero */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 border-b border-white/[0.06] pb-8"
        >
          <h1 className="headline max-w-3xl text-[26px] leading-[1.15] sm:text-[36px]">
            {heroHeadline}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted-foreground">
            <span className="font-mono">{shortAddress(raw.darer)}</span>
            <span className="text-white/15">·</span>
            <span className="font-mono text-white/70">{formatDeadline(dare.deadline)}</span>
            <span className="text-white/15">·</span>
            <InlineCountdown deadline={dare.deadline} />
          </div>
        </motion.div>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-[1.85fr_1fr] lg:items-start">
          {/* LEFT */}
          <div className="order-1 space-y-4">
            <Card>
              <div className="flex items-center justify-between">
                <div className="eyebrow">Outcome to settle</div>
                {isPrice && (
                  <span className="text-[10px] tracking-[0.2em] text-muted-foreground">
                    {coinDisplayName(dare.coinId)}
                  </span>
                )}
              </div>

              {isPrice ? (
                <>
                  <div className="mt-5">
                    <div className="font-mono text-[36px] font-semibold leading-none tabular-nums text-white sm:text-[46px]">
                      ${dare.targetPrice?.toLocaleString()}
                    </div>
                    <div className="mt-3 text-[12.5px] text-white/80">
                      {dare.condition === "reached_anytime"
                        ? "Reaches the target at any point before the deadline"
                        : "Recorded at or above the target near the deadline (latest CoinGecko sample within 90 minutes)"}
                    </div>
                  </div>
                  <dl className="mt-7 grid grid-cols-1 gap-4 border-t border-white/[0.06] pt-6 sm:grid-cols-2">
                    <Meta label="Deadline" value={formatDeadline(dare.deadline)} mono />
                    <Meta label="Settlement source" value="CoinGecko via GenLayer validators" />
                  </dl>
                </>
              ) : (
                <div className="mt-6 space-y-6">
                  {dare.claimantIdentity && (
                    <Meta label="Claimant identity" value={dare.claimantIdentity} mono />
                  )}
                  {dare.completionCriteria && (
                    <div>
                      <div className="eyebrow">Completion criteria</div>
                      <p className="mt-2.5 whitespace-pre-line text-[13.5px] leading-relaxed text-white/85">
                        {dare.completionCriteria}
                      </p>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="eyebrow">Evidence</div>
                      <span className="text-[10px] tracking-[0.2em] text-muted-foreground">
                        {dare.evidenceUrl
                          ? "SUBMITTED"
                          : dare.evidenceLockedAt
                            ? "LOCKED"
                            : "AWAITING"}
                      </span>
                    </div>
                    {dare.evidenceHint && (
                      <div className="mt-2.5 break-all font-mono text-[12px] text-muted-foreground">
                        {dare.evidenceHint}
                      </div>
                    )}

                    {dare.evidenceUrl ? (
                      <a
                        href={dare.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 block rounded-xl border border-white/[0.07] p-4 transition-colors hover:border-white/20"
                      >
                        <div className="text-[10px] tracking-[0.18em] text-muted-foreground">
                          URL
                        </div>
                        <div className="mt-1.5 truncate font-mono text-[13px] text-white">
                          {dare.evidenceUrl}
                        </div>
                        {raw.evidence_text && (
                          <div className="mt-2 text-[12px] text-muted-foreground">
                            {raw.evidence_text}
                          </div>
                        )}
                      </a>
                    ) : showEvidence && canSubmitEvidence ? (
                      <div className="mt-4 space-y-3">
                        <input
                          type="url"
                          value={evidenceUrl}
                          onChange={(e) => setEvidenceUrl(e.target.value)}
                          maxLength={500}
                          placeholder="https://…"
                          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2.5 text-[13.5px] text-white outline-none placeholder:text-muted-foreground/40 focus:border-white/30"
                        />
                        <textarea
                          rows={2}
                          value={evidenceText}
                          onChange={(e) => setEvidenceText(e.target.value)}
                          maxLength={1200}
                          placeholder="Short note for validators (optional)"
                          className="w-full resize-none rounded-lg border border-white/10 bg-transparent px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-muted-foreground/40 focus:border-white/30"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowEvidence(false)}
                            className="rounded-full border border-white/10 px-4 py-2 text-[11.5px] text-white hover:border-white/20"
                          >
                            Cancel
                          </button>
                          <button
                            disabled={pending !== "idle" || !evidenceUrl}
                            onClick={() =>
                              runAction("evidence", () =>
                                submitEvidence(
                                  chainDareId,
                                  evidenceUrl.trim(),
                                  evidenceText.trim(),
                                ),
                              )
                            }
                            className="rounded-full bg-lime px-4 py-2 text-[11.5px] font-semibold text-background disabled:opacity-60"
                          >
                            {pending === "evidence" ? "Submitting…" : "Submit evidence"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-dashed border-white/[0.08] px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                        {canSubmitEvidence ? (
                          <button
                            onClick={() => setShowEvidence(true)}
                            className="text-lime underline-offset-4 hover:underline"
                          >
                            Submit your evidence →
                          </button>
                        ) : deadlinePassed && isCreator ? (
                          "The evidence deadline has passed."
                        ) : dare.evidenceLockedAt ? (
                          "Evidence is locked in contract state."
                        ) : (
                          "Creator has not submitted evidence yet."
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>

            {/* action panel — mobile position */}
            <div className="lg:hidden">
              <ActionPanel
                stakeAmount={stakeAmount}
                setStakeAmount={setStakeAmount}
                pending={pending}
                supportDisabled={supportDisabled}
                challengeDisabled={challengeDisabled}
                marketOpen={marketOpen}
                isCreator={isCreator}
                connected={!!connected}
                myPosition={myPosition}
                onSupport={() => runAction("support", () => supportDare(chainDareId, stakeAmount))}
                onChallenge={() =>
                  runAction("challenge", () => challengeDare(chainDareId, stakeAmount))
                }
              />
            </div>

            <Card>
              <div className="eyebrow">Market positions</div>
              <div className="mt-5">
                <PositionsBar support={dare.supporters} challenge={dare.challengers} />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] tracking-[0.2em] text-muted-foreground">
                    SUPPORT POOL
                  </div>
                  <div className="mt-1.5 font-mono text-[18px] tabular-nums text-white">
                    {dare.supporters} <span className="text-[11px] text-muted-foreground">GEN</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] tracking-[0.2em] text-muted-foreground">
                    CHALLENGE POOL
                  </div>
                  <div className="mt-1.5 font-mono text-[18px] tabular-nums text-white">
                    {dare.challengers}{" "}
                    <span className="text-[11px] text-muted-foreground">GEN</span>
                  </div>
                </div>
              </div>
              <div className="mt-8 grid grid-cols-1 gap-6 border-t border-white/[0.06] pt-6 sm:grid-cols-2">
                <ParticipantList label="SUPPORTERS" list={raw.supporters} side="support" />
                <ParticipantList label="CHALLENGERS" list={raw.challengers} side="challenge" />
              </div>
              {totalPool === 0 && (
                <div className="mt-6 text-[12px] text-muted-foreground">
                  Only the creator stake is locked so far.
                </div>
              )}
            </Card>

            <Card>
              <div className="eyebrow">Consensus verdict</div>
              <div className="mt-5">
                <Timeline dare={dare} />
              </div>

              {dare.verdict && (
                <div className="mt-7 border-t border-white/[0.06] pt-6">
                  <div className="text-[10px] tracking-[0.3em] text-muted-foreground">
                    {dare.status === "retryable" ? "LATEST CONSENSUS ATTEMPT" : "CONSENSUS RESULT"}
                  </div>
                  <div
                    className={`headline mt-2 text-[34px] sm:text-[44px] ${
                      dare.verdict === "complete"
                        ? "text-gen"
                        : dare.verdict === "incomplete"
                          ? "text-deep-red"
                          : "text-amber-stake"
                    }`}
                  >
                    {dare.verdict.toUpperCase()}
                  </div>
                  {dare.receiptSummary && (
                    <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                      {dare.receiptSummary}
                    </p>
                  )}
                </div>
              )}

              {verdictCopy && (
                <p className="mt-7 border-t border-white/[0.06] pt-6 text-[13px] leading-relaxed text-muted-foreground">
                  {verdictCopy}
                </p>
              )}

              {!isPrice && ["submitted", "retryable"].includes(dare.status) && !deadlinePassed && (
                <div className="mt-5 text-[12.5px] text-muted-foreground">
                  Evidence is locked. Goal consensus opens after the deadline.
                </div>
              )}

              {canResolveGoal && (
                <button
                  disabled={pending !== "idle"}
                  onClick={() => runAction("resolve", () => resolveDare(chainDareId))}
                  className="mt-5 rounded-full border border-white/15 px-5 py-2.5 text-[12px] font-semibold text-white hover:border-white/30 disabled:opacity-60"
                >
                  {pending === "resolve"
                    ? "Resolving…"
                    : dare.status === "retryable"
                      ? "Retry validator consensus"
                      : "Trigger validator consensus"}
                </button>
              )}

              {canResolvePrice && (
                <button
                  disabled={pending !== "idle"}
                  onClick={() => runAction("price-resolve", () => resolvePriceDare(chainDareId))}
                  className="mt-5 rounded-full bg-lime px-5 py-2.5 text-[12px] font-semibold text-background hover:bg-lime/90 disabled:opacity-60"
                >
                  {pending === "price-resolve" ? "Checking…" : "Check price now →"}
                </button>
              )}

              {isPrice && ["open", "retryable"].includes(dare.status) && !priceSettlementOpen && (
                <div className="mt-5 text-[12.5px] text-muted-foreground">
                  Price settlement opens 10 minutes after the deadline.{" "}
                  <InlineCountdown deadline={priceSettlementAt} />
                </div>
              )}

              {(dare.receipt || dare.settlementMode || dare.attempts !== undefined) && (
                <div className="mt-8 space-y-4 border-t border-white/[0.06] pt-6">
                  {dare.settlementMode && (
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="eyebrow">Settlement mode</span>
                      <span className="font-mono text-[12.5px] text-white">
                        {dare.settlementMode}
                      </span>
                    </div>
                  )}
                  {dare.attempts !== undefined && (
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="eyebrow">Resolution attempts</span>
                      <span className="font-mono text-[12.5px] tabular-nums text-white">
                        {dare.attempts}
                      </span>
                    </div>
                  )}
                  {dare.receipt && (
                    <div>
                      <div className="eyebrow">Receipt</div>
                      <pre className="mt-2.5 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[11.5px] leading-relaxed text-muted-foreground">
                        {formatReceipt(dare.receipt)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* RIGHT sticky */}
          <div className="order-2 space-y-4 lg:sticky lg:top-28">
            <Card className="!p-0">
              <div className="grid grid-cols-2 gap-px bg-white/[0.06]">
                {[
                  { l: "CREATOR STAKE", v: `${dare.stake}` },
                  { l: "SUPPORT", v: `${dare.supporters}` },
                  { l: "CHALLENGE", v: `${dare.challengers}` },
                  { l: "ATTEMPTS", v: dare.attempts !== undefined ? String(dare.attempts) : "—" },
                ].map((s) => (
                  <div
                    key={s.l}
                    className="bg-background p-4 first:rounded-tl-2xl [&:nth-child(2)]:rounded-tr-2xl [&:nth-child(3)]:rounded-bl-2xl last:rounded-br-2xl"
                  >
                    <div className="text-[9px] tracking-[0.2em] text-muted-foreground">{s.l}</div>
                    <div className="mt-1.5 font-mono text-[17px] font-semibold tabular-nums text-white">
                      {s.v}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CountdownGrid deadline={dare.deadline} />
            </Card>

            {showSettlementActions && (
              <Card>
                <div className="eyebrow">Settlement actions</div>
                <div className="mt-5 space-y-2.5">
                  {canClaim && (
                    <button
                      disabled={pending !== "idle"}
                      onClick={() => runAction("claim", () => claimPayout(chainDareId))}
                      className="block w-full rounded-full bg-lime px-4 py-3 text-[12px] font-semibold text-background hover:bg-lime/90 disabled:opacity-50"
                    >
                      {pending === "claim"
                        ? "Claiming…"
                        : `${dare.settlementMode === "REFUND" ? "Claim refund" : "Claim payout"} · ${claimableGen} GEN`}
                    </button>
                  )}

                  {canFinalizeAbandoned && (
                    <button
                      disabled={pending !== "idle"}
                      onClick={() => runAction("abandon", () => claimAbandoned(chainDareId))}
                      className="block w-full rounded-full border border-deep-red/40 px-4 py-3 text-[12px] font-semibold text-deep-red hover:border-deep-red disabled:opacity-50"
                    >
                      {pending === "abandon" ? "Finalizing…" : "Finalize missing evidence"}
                    </button>
                  )}

                  {canCancel && (
                    <button
                      disabled={pending !== "idle"}
                      onClick={() => runAction("cancel", () => cancelOpenDare(chainDareId))}
                      className="block w-full rounded-full border border-white/15 px-4 py-3 text-[12px] font-semibold text-white hover:border-white/30 disabled:opacity-50"
                    >
                      {pending === "cancel" ? "Canceling…" : "Cancel unjoined dare and refund"}
                    </button>
                  )}

                  {stalledStatus && !canForceRefund && (
                    <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                      Emergency refund opens after the 24-hour consensus recovery window.{" "}
                      <InlineCountdown deadline={stalledRefundAt} />
                    </p>
                  )}

                  {canForceRefund && (
                    <button
                      disabled={pending !== "idle"}
                      onClick={() =>
                        runAction("force-refund", () => forceRefundStalled(chainDareId))
                      }
                      className="block w-full rounded-full border border-amber-stake/50 px-4 py-3 text-[12px] font-semibold text-amber-stake hover:border-amber-stake disabled:opacity-50"
                    >
                      {pending === "force-refund"
                        ? "Opening refund…"
                        : "Refund after stalled consensus"}
                    </button>
                  )}
                </div>
              </Card>
            )}

            <div className="hidden lg:block">
              <ActionPanel
                stakeAmount={stakeAmount}
                setStakeAmount={setStakeAmount}
                pending={pending}
                supportDisabled={supportDisabled}
                challengeDisabled={challengeDisabled}
                marketOpen={marketOpen}
                isCreator={isCreator}
                connected={!!connected}
                myPosition={myPosition}
                onSupport={() => runAction("support", () => supportDare(chainDareId, stakeAmount))}
                onChallenge={() =>
                  runAction("challenge", () => challengeDare(chainDareId, stakeAmount))
                }
              />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`mt-2 break-words text-[13px] text-white/85 ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function InlineCountdown({ deadline }: { deadline: number }) {
  const c = useCountdown(deadline);
  return (
    <span className={`font-mono ${c.past ? "text-deep-red" : "text-electric"}`}>
      {c.past ? "Deadline passed" : `${c.d}d ${c.h}h ${c.m}m ${String(c.s).padStart(2, "0")}s left`}
    </span>
  );
}

function CountdownGrid({ deadline }: { deadline: number }) {
  const c = useCountdown(deadline);
  const tiles = [
    { v: c.d, l: "DAYS" },
    { v: c.h, l: "HRS" },
    { v: c.m, l: "MIN" },
    { v: c.s, l: "SEC" },
  ];
  return (
    <div>
      <div className="eyebrow">{c.past ? "Deadline passed" : "Time remaining"}</div>
      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/[0.06]">
        {tiles.map((t) => (
          <div key={t.l} className="bg-background p-3.5 text-center">
            <div
              className={`font-mono text-[22px] font-semibold tabular-nums ${c.past ? "text-deep-red" : "text-white"}`}
            >
              {String(t.v).padStart(2, "0")}
            </div>
            <div className="mt-1 text-[9px] tracking-[0.2em] text-muted-foreground">{t.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionPanel({
  stakeAmount,
  setStakeAmount,
  pending,
  supportDisabled,
  challengeDisabled,
  marketOpen,
  isCreator,
  connected,
  myPosition,
  onSupport,
  onChallenge,
}: {
  stakeAmount: number;
  setStakeAmount: (n: number) => void;
  pending: Action;
  supportDisabled: boolean;
  challengeDisabled: boolean;
  marketOpen: boolean;
  isCreator: boolean;
  connected: boolean;
  myPosition: { side: "Support" | "Challenge"; amount: number } | null;
  onSupport: () => void;
  onChallenge: () => void;
}) {
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Stake amount</span>
        <span className="font-mono text-[13px] tabular-nums text-white">{stakeAmount} GEN</span>
      </div>
      <input
        type="range"
        min={5}
        max={250}
        value={stakeAmount}
        onChange={(e) => setStakeAmount(Number(e.target.value))}
        aria-label="Stake amount in GEN"
        className="mt-3 w-full"
      />

      <div className="mt-6 space-y-2.5">
        <button
          disabled={supportDisabled}
          onClick={onSupport}
          className="block w-full rounded-full bg-lime px-4 py-3.5 text-[12.5px] font-semibold text-background transition-colors hover:bg-lime/90 disabled:opacity-40"
        >
          {pending === "support" ? "Supporting…" : `Support · ${stakeAmount} GEN`}
        </button>
        <button
          disabled={challengeDisabled}
          onClick={onChallenge}
          className="block w-full rounded-full border border-deep-red/50 px-4 py-3.5 text-[12.5px] font-semibold text-deep-red transition-colors hover:border-deep-red disabled:opacity-40"
        >
          {pending === "challenge" ? "Challenging…" : `Challenge · ${stakeAmount} GEN`}
        </button>
      </div>

      <div className="mt-4 space-y-1.5 text-[11.5px] text-muted-foreground">
        {isCreator && (
          <div className="text-white/80">
            You created this dare — you cannot support or challenge it.
          </div>
        )}
        {!marketOpen && <div>This dare is no longer open for new positions.</div>}
        {!connected && !isCreator && <div>Connect a wallet to take a position.</div>}
        {myPosition && (
          <div className="flex items-baseline justify-between border-t border-white/[0.06] pt-3 text-[12px]">
            <span className="eyebrow">Your position</span>
            <span
              className={`font-mono tabular-nums ${myPosition.side === "Support" ? "text-lime" : "text-deep-red"}`}
            >
              {myPosition.side} · {myPosition.amount} GEN
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
