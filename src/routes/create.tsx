import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, Lock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  createDare,
  createPriceDare,
  getTransactionErrorMessage,
  usdToMicroUsd,
} from "@/lib/contract";
import { useWallet, STUDIO_NEXT_CHAIN_ID_HEX } from "@/lib/wallet";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create a Dare — GenDare" },
      {
        name: "description",
        content: "Stake GEN on a price call or a public goal. Onchain truth, AI consensus.",
      },
      { property: "og:title", content: "Create a Dare — GenDare" },
      {
        property: "og:description",
        content: "Stake GEN on a price call or a public goal. Onchain truth, AI consensus.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreateDare,
});

type Tab = "price" | "goal";
type GoalCategory = "Building" | "Writing" | "Onchain";

const GOAL_CATEGORIES: GoalCategory[] = ["Building", "Writing", "Onchain"];
const COIN_PRESETS = [
  { id: "bitcoin", label: "Bitcoin", ticker: "BTC" },
  { id: "ethereum", label: "Ethereum", ticker: "ETH" },
  { id: "solana", label: "Solana", ticker: "SOL" },
  { id: "genlayer", label: "GenLayer", ticker: "GEN" },
  { id: "binancecoin", label: "BNB", ticker: "BNB" },
  { id: "ripple", label: "XRP", ticker: "XRP" },
];

const PRICE_DEADLINE_BUFFER_MS = 12 * 60 * 1000;
const GOAL_DEADLINE_BUFFER_MS = 2 * 60 * 1000;

const EVIDENCE_HINTS: Record<GoalCategory, string> = {
  Building:
    "GitHub: raw.githubusercontent.com/username/repo/main/README.md — NPM: registry.npmjs.org/package — Contract: api.etherscan.io/api?module=contract...",
  Writing: "Dev.to: dev.to/api/articles?username=you — Substack: yourname.substack.com/p/article",
  Onchain: "Etherscan: api.etherscan.io/api?module=account&action=balance&address=0x...",
};

const inputCls =
  "w-full rounded-lg border border-input bg-white/[0.02] px-3.5 py-2.5 text-[14px] text-white outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-white/30";

function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string | null;
}) {
  return (
    <div>
      <span className="eyebrow">{label}</span>
      <div className="mt-2.5">{children}</div>
      {error ? (
        <span className="mt-2 block text-[11.5px] text-deep-red">{error}</span>
      ) : hint ? (
        <span className="mt-2 block text-[11.5px] leading-relaxed text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function SectionHeading({ num, title }: { num: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3 border-t border-white/[0.07] pt-7">
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{num}</span>
      <span className="eyebrow !text-white/70">{title}</span>
    </div>
  );
}

function CreateDare() {
  const navigate = useNavigate();
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>("goal");
  const [submitting, setSubmitting] = useState<"idle" | "wallet" | "signing">("idle");
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  // shared
  const [deadline, setDeadline] = useState("");
  const [stake, setStake] = useState(25);
  const [isPublic, setIsPublic] = useState(true);

  // price tab
  const [coinId, setCoinId] = useState("bitcoin");
  const [targetPrice, setTargetPrice] = useState("150000");
  const [condition, setCondition] = useState<"above_at_deadline" | "reached_anytime">(
    "above_at_deadline",
  );

  // goal tab
  const [category, setCategory] = useState<GoalCategory>("Building");
  const [goal, setGoal] = useState("");
  const [claimantIdentity, setClaimantIdentity] = useState("");
  const [completionCriteria, setCompletionCriteria] = useState("");
  const [evidence, setEvidence] = useState("");

  const ensureChain = async () => {
    if (!wallet.address) await wallet.connect();
    if (wallet.chainId && wallet.chainId !== STUDIO_NEXT_CHAIN_ID_HEX) {
      const ok = await wallet.switchToStudioNext();
      if (!ok) return false;
    }
    return true;
  };

  const previewText = (() => {
    if (!targetPrice.trim() || !deadline) return "I dare that …";
    const selectedCoin = COIN_PRESETS.find((c) => c.id === coinId);
    const coin = selectedCoin
      ? `${selectedCoin.label.toUpperCase()} (${selectedCoin.ticker})`
      : coinId.toUpperCase();
    const date = new Date(deadline);
    const dStr = isNaN(date.getTime())
      ? "the deadline"
      : date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
    const priceStr = `$${targetPrice.trim()}`;
    const verb =
      condition === "above_at_deadline"
        ? `will be above ${priceStr} by ${dStr}`
        : `will reach ${priceStr} before ${dStr}`;
    return `I dare that ${coin} ${verb}`;
  })();

  const deadlineLabel = (() => {
    if (!deadline) return null;
    const d = new Date(deadline);
    return isNaN(d.getTime())
      ? null
      : d.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  })();

  // Missing-items checklist (display only — validation itself stays in the submit handlers)
  const missing: string[] = (() => {
    if (tab === "price") {
      const m: string[] = [];
      if (!coinId.trim()) m.push("Coin / CoinGecko ID");
      if (!targetPrice.trim()) m.push("Target price");
      else {
        try {
          usdToMicroUsd(targetPrice);
        } catch {
          m.push("Valid target price");
        }
      }
      if (!deadline) m.push("Deadline");
      else if (new Date(deadline).getTime() - Date.now() < PRICE_DEADLINE_BUFFER_MS)
        m.push("Deadline ≥ 12 min out");
      if (stake < 5) m.push("Stake ≥ 5 GEN");
      return m;
    }
    const m: string[] = [];
    const g = goal.trim();
    const ident = claimantIdentity.trim();
    const crit = completionCriteria.trim();
    if (g.length < 10 || g.length > 400) m.push("Goal (10–400 chars)");
    if (ident.length < 3 || ident.length > 160) m.push("Claimant identity");
    if (crit.length < 10 || crit.length > 800) m.push("Completion criteria");
    if (!deadline || new Date(deadline).getTime() - Date.now() < GOAL_DEADLINE_BUFFER_MS)
      m.push("Deadline ≥ 2 min out");
    if (stake < 5) m.push("Stake ≥ 5 GEN");
    return m;
  })();

  // Inline field errors — derived from the same rules the submit handlers enforce
  const priceErrors = attempted
    ? {
        coinId: !coinId.trim() ? "Pick a coin" : null,
        targetPrice: (() => {
          if (!targetPrice.trim()) return "Enter a target price";
          try {
            usdToMicroUsd(targetPrice);
            return null;
          } catch (err) {
            return (err as Error).message;
          }
        })(),
        deadline: !deadline
          ? "Pick a deadline"
          : new Date(deadline).getTime() <= Date.now()
            ? "Deadline must be in the future"
            : new Date(deadline).getTime() - Date.now() < PRICE_DEADLINE_BUFFER_MS
              ? "Must be at least 12 minutes from now"
              : null,
        stake: stake < 5 ? "Minimum stake is 5 GEN" : null,
      }
    : { coinId: null, targetPrice: null, deadline: null, stake: null };

  const goalErrors = attempted
    ? {
        goal:
          goal.trim().length < 10 || goal.trim().length > 400
            ? "Goal must be 10–400 characters"
            : null,
        claimantIdentity:
          claimantIdentity.trim().length < 3 || claimantIdentity.trim().length > 160
            ? "Must be 3–160 characters"
            : null,
        completionCriteria:
          completionCriteria.trim().length < 10 || completionCriteria.trim().length > 800
            ? "Must be 10–800 characters"
            : null,
        evidence: evidence.trim().length > 500 ? "Max 500 characters" : null,
        deadline: !deadline
          ? "Pick a deadline"
          : new Date(deadline).getTime() - Date.now() < GOAL_DEADLINE_BUFFER_MS
            ? "Must be at least 2 minutes from now"
            : null,
        stake: stake < 5 ? "Minimum stake is 5 GEN" : null,
      }
    : {
        goal: null,
        claimantIdentity: null,
        completionCriteria: null,
        evidence: null,
        deadline: null,
        stake: null,
      };

  const onSubmitPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!coinId.trim()) return toast.error("Pick a coin");
    if (!deadline) return toast.error("Pick a deadline");
    if (stake < 5) return toast.error("Minimum stake is 5 GEN");
    const deadlineDate = new Date(deadline);
    const submitTime = Date.now();
    if (deadlineDate.getTime() - submitTime < PRICE_DEADLINE_BUFFER_MS)
      return toast.error("Price dare deadline must be at least 12 minutes from now");

    // USD string -> integer micro-USD bigint. No float maths, ever.
    let microUsd: bigint;
    try {
      microUsd = usdToMicroUsd(targetPrice);
    } catch (err) {
      return toast.error((err as Error).message);
    }

    try {
      setSubmitting("wallet");
      if (!(await ensureChain())) return setSubmitting("idle");
      setSubmitting("signing");
      const outcome = await createPriceDare(
        coinId,
        microUsd,
        condition,
        deadlineDate,
        isPublic,
        String(stake),
      );
      setTxHash(outcome.hash);
      if (!outcome.success) {
        toast.error(
          `Transaction not confirmed — still tracking (${outcome.detail ?? "undetermined"})`,
        );
        return;
      }
      toast.success("Price dare signed onchain");
      setSuccess(true);
      const addr = wallet.address ?? "";
      const optimisticDare = {
        id: `pending-${Date.now()}`,
        goal: previewText,
        category: "Price",
        creator: addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "0x…",
        creatorRaw: addr,
        stake: stake * 0.9,
        supporters: 0,
        challengers: 0,
        supporterCount: 0,
        challengerCount: 0,
        deadline: Math.floor(deadlineDate.getTime() / 1000),
        status: "open",
        createdAt: Date.now(),
        pending: true,
        dareType: "price",
        coinId: coinId.trim(),
        targetPriceMicroUsd: microUsd.toString(),
        targetPrice: Number(microUsd) / 1_000_000,
        condition,
      };

      navigate({ to: "/", state: { optimisticDare } as never });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4001) toast.error("Transaction rejected");
      else toast.error(getTransactionErrorMessage(err));
    } finally {
      setSubmitting("idle");
    }
  };

  const onSubmitGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    const g = goal.trim();
    const ident = claimantIdentity.trim();
    const crit = completionCriteria.trim();
    if (g.length < 10 || g.length > 400) return toast.error("Goal must be 10–400 characters");
    if (ident.length < 3 || ident.length > 160)
      return toast.error("Claimant identity must be 3–160 characters");
    if (crit.length < 10 || crit.length > 800)
      return toast.error("Completion criteria must be 10–800 characters");
    if (evidence.trim().length > 500)
      return toast.error("Evidence hint must be 500 characters or fewer");
    if (!deadline) return toast.error("Pick a deadline");
    if (stake < 5) return toast.error("Minimum stake is 5 GEN");
    const deadlineDate = new Date(deadline);
    const submitTime = Date.now();
    if (deadlineDate.getTime() - submitTime < GOAL_DEADLINE_BUFFER_MS)
      return toast.error("Goal dare deadline must be at least 2 minutes from now");

    try {
      setSubmitting("wallet");
      if (!(await ensureChain())) return setSubmitting("idle");
      setSubmitting("signing");
      // create_dare(goal, claimant_identity, completion_criteria, deadline, evidence_hint, category, is_public)
      const outcome = await createDare(
        g,
        ident,
        crit,
        deadlineDate,
        evidence.trim(),
        category,
        isPublic,
        String(stake),
      );
      setTxHash(outcome.hash);
      if (!outcome.success) {
        toast.error(
          `Transaction not confirmed — still tracking (${outcome.detail ?? "undetermined"})`,
        );
        return;
      }
      toast.success("Dare signed onchain");
      setSuccess(true);
      const addr = wallet.address ?? "";
      const optimisticDare = {
        id: `pending-${Date.now()}`,
        goal: g,
        category,
        creator: addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "0x…",
        creatorRaw: addr,
        stake: stake * 0.9,
        supporters: 0,
        challengers: 0,
        supporterCount: 0,
        challengerCount: 0,
        deadline: Math.floor(deadlineDate.getTime() / 1000),
        status: "open",
        createdAt: Date.now(),
        pending: true,
        dareType: "goal",
        claimantIdentity: ident,
        completionCriteria: crit,
        evidenceHint: evidence.trim(),
      };

      navigate({ to: "/", state: { optimisticDare } as never });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4001) toast.error("Transaction rejected");
      else toast.error(getTransactionErrorMessage(err));
    } finally {
      setSubmitting("idle");
    }
  };

  const handleSubmit = tab === "price" ? onSubmitPrice : onSubmitGoal;

  const stakeRow = (
    <Field
      label="Stake"
      hint="Minimum 5 GEN. Locked until consensus."
      error={tab === "price" ? priceErrors.stake : goalErrors.stake}
    >
      <div className="flex items-center gap-3 rounded-lg border border-white/15 bg-white/[0.03] px-3.5 py-2.5 focus-within:border-white/30">
        <input
          type="number"
          min={5}
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
          className="w-24 bg-transparent text-[22px] font-semibold tabular-nums text-white outline-none"
        />
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          GEN
        </span>
      </div>
    </Field>
  );

  const deadlineField = (
    <Field
      label="Deadline"
      hint={
        tab === "price"
          ? "At least 12 minutes from now to protect the 10-minute contract boundary."
          : "At least 2 minutes from now."
      }
      error={tab === "price" ? priceErrors.deadline : goalErrors.deadline}
    >
      <input
        type="datetime-local"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        className={inputCls}
      />
    </Field>
  );

  const reviewCard = (
    <div className="surface-elevated rounded-2xl p-6 sm:p-7">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Review</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Studio Next
        </span>
      </div>

      <p className="mt-5 text-[17px] font-medium leading-snug text-white">
        {tab === "price" ? previewText : goal.trim() ? goal.trim() : "I dare that …"}
      </p>

      <dl className="mt-6 space-y-3 border-t border-white/[0.07] pt-5">
        {[
          { k: "Type", v: tab === "price" ? "Price dare" : "Goal dare" },
          { k: "Stake", v: `${stake} GEN` },
          { k: "Deadline", v: deadlineLabel ?? "—" },
          { k: "Visibility", v: isPublic ? "Public" : "Unlisted" },
          { k: "Network", v: "Studio Next" },
        ].map((row) => (
          <div key={row.k} className="flex items-baseline justify-between gap-4">
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {row.k}
            </dt>
            <dd className="truncate text-[13px] font-medium text-white">{row.v}</dd>
          </div>
        ))}
      </dl>

      {missing.length > 0 ? (
        <div className="mt-6 border-t border-white/[0.07] pt-5">
          <span className="eyebrow">Still needed</span>
          <ul className="mt-3 space-y-1.5">
            {missing.map((m) => (
              <li key={m} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <span className="h-1 w-1 shrink-0 rounded-full bg-white/30" />
                {m}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-6 border-t border-white/[0.07] pt-5 text-[12px] text-muted-foreground">
          Ready to sign onchain.
        </div>
      )}

      <button
        type="submit"
        form="create-dare-form"
        disabled={submitting !== "idle"}
        className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-4 text-[13.5px] font-semibold text-background transition-colors hover:bg-white/90 disabled:opacity-60"
      >
        {submitting === "wallet"
          ? "Connecting wallet…"
          : submitting === "signing"
            ? "Awaiting signature…"
            : tab === "price"
              ? "Create price dare"
              : "Create goal dare"}
        {submitting === "idle" && <span aria-hidden>→</span>}
      </button>
      <p className="mt-3.5 text-center text-[11px] leading-relaxed text-muted-foreground">
        By signing you lock {stake} GEN onchain until consensus.
      </p>
    </div>
  );

  return (
    <div className="relative min-h-screen">
      <AmbientBackground />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-28 pt-20 sm:px-8 sm:pt-28">
        {/* Compact intro */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="max-w-2xl"
        >
          <div className="eyebrow">Create on-chain dare</div>
          <h1 className="headline mt-4 text-[36px] sm:text-[52px]">
            Put a stake behind the claim.
          </h1>
          <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
            Set the outcome. Lock the evidence. Let consensus settle it.
          </p>
        </motion.div>

        {/* Segmented type selector */}
        <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.06]">
          {(
            [
              { id: "price", label: "Price Dare", desc: "Call a coin's price" },
              { id: "goal", label: "Goal Dare", desc: "Stake on a public goal" },
            ] as { id: Tab; label: string; desc: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-4 text-left transition-colors sm:px-6 ${
                tab === t.id ? "bg-white/[0.05]" : "bg-background hover:bg-white/[0.02]"
              }`}
            >
              <div
                className={`text-[14px] font-semibold ${tab === t.id ? "text-white" : "text-muted-foreground"}`}
              >
                {t.label}
              </div>
              <div className="mt-0.5 hidden text-[11.5px] text-muted-foreground sm:block">
                {t.desc}
              </div>
            </button>
          ))}
        </div>

        <form id="create-dare-form" onSubmit={handleSubmit} className="mt-12">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] lg:gap-14">
            {/* Left — the form */}
            <div className="min-w-0 space-y-9">
              {tab === "price" ? (
                <>
                  <section className="space-y-7">
                    <SectionHeading num="01" title="The dare" />
                    <Field
                      label="Coin"
                      hint="Price source identifier used for settlement."
                      error={priceErrors.coinId}
                    >
                      <Select value={coinId} onValueChange={setCoinId}>
                        <SelectTrigger
                          aria-label="Settlement coin"
                          className="h-12 w-full rounded-lg border-input bg-white/[0.02] px-3.5 text-[14px] text-white shadow-none hover:bg-white/[0.04] focus:ring-2 focus:ring-lime/70 focus:ring-offset-2 focus:ring-offset-background [&>svg]:size-[17px] [&>svg]:text-muted-foreground [&>svg]:opacity-100"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent
                          position="popper"
                          className="z-[80] rounded-lg border border-white/10 bg-[#0c0c0d] p-1 text-white shadow-lg shadow-black/50"
                        >
                          {COIN_PRESETS.map((c) => (
                            <SelectItem
                              key={c.id}
                              value={c.id}
                              className="min-h-11 cursor-pointer rounded-md px-3.5 py-2.5 text-[14px] text-white/85 transition-colors focus:bg-white/[0.06] focus:text-lime data-[state=checked]:text-white [&_svg]:text-lime"
                            >
                              {c.label} ({c.ticker})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field
                      label="Target price (USD)"
                      hint="Up to 6 decimals. Recorded onchain in micro-USD — $0.125 becomes 125000."
                      error={priceErrors.targetPrice}
                    >
                      <div className="flex items-center gap-2 rounded-lg border border-input bg-white/[0.02] px-3.5 py-2.5 focus-within:border-white/30">
                        <span className="text-[15px] font-medium text-muted-foreground">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={targetPrice}
                          onChange={(e) => setTargetPrice(e.target.value)}
                          placeholder="150000"
                          className="w-full bg-transparent text-[15px] font-medium tabular-nums text-white outline-none placeholder:text-muted-foreground/50"
                        />
                      </div>
                    </Field>

                    <Field label="Condition">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {(
                          [
                            {
                              id: "above_at_deadline",
                              label: "Above at deadline",
                              desc: "Price must be above target when the clock hits zero",
                            },
                            {
                              id: "reached_anytime",
                              label: "Reaches anytime before",
                              desc: "Price touches target at any moment before deadline",
                            },
                          ] as const
                        ).map((opt) => (
                          <button
                            type="button"
                            key={opt.id}
                            onClick={() => setCondition(opt.id)}
                            className={`rounded-xl border p-4 text-left transition-colors ${
                              condition === opt.id
                                ? "border-white/40 bg-white/[0.04]"
                                : "border-white/[0.08] hover:border-white/20"
                            }`}
                          >
                            <div className="text-[13px] font-semibold text-white">{opt.label}</div>
                            <div className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                              {opt.desc}
                            </div>
                          </button>
                        ))}
                      </div>
                    </Field>
                  </section>

                  <section className="space-y-7">
                    <SectionHeading num="02" title="Proof & deadline" />
                    {deadlineField}
                  </section>

                  <section className="space-y-7">
                    <SectionHeading num="03" title="Stake & visibility" />
                    {stakeRow}
                    <PublicToggle isPublic={isPublic} setIsPublic={setIsPublic} />
                  </section>
                </>
              ) : (
                <>
                  <section className="space-y-7">
                    <SectionHeading num="01" title="The dare" />
                    <Field label="Category">
                      <div className="flex flex-wrap gap-1.5">
                        {GOAL_CATEGORIES.map((c) => (
                          <button
                            type="button"
                            key={c}
                            onClick={() => setCategory(c)}
                            className={`rounded-full border px-3.5 py-2 text-[11.5px] font-medium transition-colors ${
                              category === c
                                ? "border-white/40 bg-white/[0.04] text-white"
                                : "border-white/[0.08] text-muted-foreground hover:text-white"
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </Field>

                    <Field
                      label="Your goal"
                      hint={`10–400 characters. ${goal.trim().length}/400`}
                      error={goalErrors.goal}
                    >
                      <textarea
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                        rows={2}
                        maxLength={400}
                        placeholder="I will ship my app by Friday"
                        className={`${inputCls} resize-none leading-relaxed`}
                      />
                    </Field>

                    <Field
                      label="Claimant identity"
                      hint={`The public person, wallet or profile validators must match to you — e.g. github.com/yourname, @yourhandle or 0xYourAddress. 3–160 characters. ${claimantIdentity.trim().length}/160`}
                      error={goalErrors.claimantIdentity}
                    >
                      <input
                        type="text"
                        value={claimantIdentity}
                        onChange={(e) => setClaimantIdentity(e.target.value)}
                        maxLength={160}
                        placeholder="github.com/yourname"
                        className={inputCls}
                      />
                    </Field>
                  </section>

                  <section className="space-y-7">
                    <SectionHeading num="02" title="Proof & deadline" />
                    <Field
                      label="Completion criteria"
                      hint={`Must be objectively checkable from public evidence — no opinions, no private proof. 10–800 characters. ${completionCriteria.trim().length}/800`}
                      error={goalErrors.completionCriteria}
                    >
                      <textarea
                        value={completionCriteria}
                        onChange={(e) => setCompletionCriteria(e.target.value)}
                        rows={3}
                        maxLength={800}
                        placeholder="The repo github.com/yourname/app has a v1.0.0 release tag published before the deadline."
                        className={`${inputCls} resize-none leading-relaxed`}
                      />
                    </Field>

                    <Field
                      label="Evidence hint"
                      hint={`What URL will validators read? Max 500 characters. ${evidence.trim().length}/500`}
                      error={goalErrors.evidence}
                    >
                      <input
                        type="text"
                        value={evidence}
                        onChange={(e) => setEvidence(e.target.value)}
                        maxLength={500}
                        placeholder={EVIDENCE_HINTS[category]}
                        className={inputCls}
                      />
                    </Field>

                    {deadlineField}
                  </section>

                  <section className="space-y-7">
                    <SectionHeading num="03" title="Stake & visibility" />
                    {stakeRow}
                    <PublicToggle isPublic={isPublic} setIsPublic={setIsPublic} />
                  </section>
                </>
              )}
            </div>

            {/* Right — sticky live review */}
            <div className="lg:sticky lg:top-24 lg:self-start">{reviewCard}</div>
          </div>
        </form>
      </main>

      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setSuccess(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl surface-elevated p-10 text-center"
            >
              <div className="eyebrow">Live onchain</div>
              <h3 className="headline mt-5 text-[32px]">Your reputation is staked.</h3>
              <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                The dare is live on Studio Next.
              </p>
              {txHash && (
                <a
                  href={`https://explorer-studio-dev.genlayer.com/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block break-all font-mono text-[11px] text-muted-foreground hover:text-white"
                >
                  {txHash.slice(0, 10)}…{txHash.slice(-8)} ↗
                </a>
              )}
              <div className="mt-9 flex gap-2.5">
                <button
                  onClick={() => setSuccess(false)}
                  className="flex-1 rounded-full border border-white/10 px-4 py-3 text-[12.5px] font-medium text-white hover:border-white/20"
                >
                  Close
                </button>
                <button
                  onClick={() => navigate({ to: "/my-dares" })}
                  className="flex-1 rounded-full bg-white px-4 py-3 text-[12.5px] font-semibold text-background hover:bg-white/90"
                >
                  My dares →
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}

function PublicToggle({
  isPublic,
  setIsPublic,
}: {
  isPublic: boolean;
  setIsPublic: (b: boolean) => void;
}) {
  const Icon = isPublic ? Eye : Lock;

  return (
    <div
      className={`flex min-h-20 items-center justify-between gap-4 rounded-lg border px-4 py-3.5 transition-colors ${
        isPublic ? "border-lime/40 bg-lime/[0.04]" : "border-white/15 bg-surface"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
            isPublic
              ? "border-lime/30 bg-lime/10 text-lime"
              : "border-white/10 bg-white/[0.03] text-muted-foreground"
          }`}
          aria-hidden="true"
        >
          <Icon size={16} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <div
            className={`font-mono text-[11px] font-semibold tracking-[0.16em] ${isPublic ? "text-lime" : "text-foreground"}`}
          >
            {isPublic ? "PUBLIC" : "UNLISTED"}
          </div>
          <div className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
            {isPublic
              ? "Visible on the feed. Anyone can support or challenge."
              : "Hidden from the feed. Available by direct link only."}
          </div>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isPublic}
        aria-label={`Visibility: ${isPublic ? "Public" : "Unlisted"}`}
        onClick={() => setIsPublic(!isPublic)}
        className="group flex min-h-11 min-w-14 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span
          className={`relative h-7 w-12 rounded-full border transition-colors ${
            isPublic
              ? "border-lime bg-lime"
              : "border-white/20 bg-charcoal group-hover:border-white/35"
          }`}
        >
          <span
            className={`absolute left-0 top-0.5 h-[22px] w-[22px] rounded-full shadow-sm transition-transform duration-200 ${
              isPublic ? "translate-x-[22px] bg-background" : "translate-x-0.5 bg-foreground"
            }`}
          />
        </span>
      </button>
    </div>
  );
}
