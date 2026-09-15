import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Dare } from "@/lib/dares";
import { coinDisplayName, dareRouteId } from "@/lib/dares";
import { StatusBadge } from "./StatusBadge";
import { formatCountdown } from "@/lib/countdown";
import { resolvePriceDare, RETRY_COOLDOWN_SECONDS } from "@/lib/contract";
import { useWallet, STUDIO_NEXT_CHAIN_ID_HEX } from "@/lib/wallet";

export function DareCard({
  dare,
  index = 0,
  variant = "default",
}: {
  dare: Dare;
  index?: number;
  variant?: "default" | "price";
}) {
  const [, force] = useState(0);
  const wallet = useWallet();
  const [resolving, setResolving] = useState(false);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const total = dare.supporters + dare.challengers || 1;
  const supportPct = (dare.supporters / total) * 100;
  const isPrice = dare.dareType === "price";
  const deadlinePassed = dare.deadline * 1000 < Date.now();
  const priceSettlementAt = dare.deadline + 10 * 60;
  const priceSettlementOpen = priceSettlementAt * 1000 <= Date.now();
  const retryAvailable =
    dare.status !== "retryable" ||
    !dare.lastAttemptAt ||
    dare.lastAttemptAt + RETRY_COOLDOWN_SECONDS * 1000 <= Date.now();
  const canResolve =
    isPrice &&
    ["open", "retryable"].includes(dare.status) &&
    priceSettlementOpen &&
    retryAvailable &&
    (dare.attempts ?? 0) < 3;

  const onResolve = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      setResolving(true);
      if (!wallet.address) await wallet.connect();
      if (wallet.chainId && wallet.chainId !== STUDIO_NEXT_CHAIN_ID_HEX) {
        const ok = await wallet.switchToStudioNext();
        if (!ok) return;
      }
      const outcome = await resolvePriceDare(Number(dare.id));
      if (!outcome.success) {
        toast.error(
          `Price check not confirmed — still tracking (${outcome.detail ?? "undetermined"})`,
        );
        return;
      }
      toast.success("Price check executed");
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4001) toast.error("Transaction rejected");
      else toast.error((err as Error)?.message ?? "Resolve failed");
    } finally {
      setResolving(false);
    }
  };

  const inner = (
    <article
      className={`relative flex h-full flex-col rounded-2xl ${variant === "price" ? "border border-electric/20 bg-gradient-to-br from-[#0a0f1a] to-[#080808]" : "surface"} p-6 transition-colors duration-300 hover:border-white/[0.12] sm:p-7`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {isPrice ? "💰 Price" : dare.category}
        </span>
        {dare.pending ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[9.5px] font-medium uppercase tracking-[0.16em] text-white/70">
            <span className="h-1 w-1 animate-pulse rounded-full bg-electric" />
            Pending finalization
          </span>
        ) : (
          <StatusBadge status={dare.status} />
        )}
      </div>

      {isPrice && dare.targetPrice ? (
        <div className="mt-7">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {coinDisplayName(dare.coinId)}
          </div>
          <div className="mt-2 text-[36px] font-semibold tabular-nums text-white sm:text-[44px]">
            ${dare.targetPrice.toLocaleString()}
          </div>
          <div className="mt-2 text-[12px] text-muted-foreground">
            {dare.condition === "reached_anytime"
              ? "Reaches anytime before deadline"
              : "Recorded above near deadline"}
          </div>
        </div>
      ) : (
        <h3 className="mt-7 text-pretty text-[22px] font-semibold leading-[1.2] tracking-tight text-white sm:text-[26px]">
          {dare.goal}
        </h3>
      )}

      <div className="mt-3 flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <span className="font-mono">{dare.creator}</span>
        <span className="text-white/15">·</span>
        <span>
          {isPrice && deadlinePassed && !priceSettlementOpen
            ? `Settlement ${formatCountdown(priceSettlementAt)}`
            : formatCountdown(dare.deadline)}
        </span>
      </div>

      <div className="flex-1" />

      <div className="mt-10">
        <div className="flex items-center justify-between text-[10.5px] tracking-[0.08em] text-muted-foreground">
          <span>Support · {dare.supporters}</span>
          <span>Challenge · {dare.challengers}</span>
        </div>
        <div className="mt-2 h-px w-full overflow-hidden bg-white/[0.06]">
          <div className="flex h-full">
            <div
              className="h-full bg-electric transition-all duration-700"
              style={{ width: `${supportPct}%` }}
            />
            <div className="h-full flex-1 bg-deep-red/70" />
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-end justify-between border-t border-white/[0.05] pt-5">
        <div>
          <div className="text-[9.5px] tracking-[0.22em] text-muted-foreground">STAKE</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[20px] font-semibold tracking-tight text-white tabular-nums">
              {dare.stake}
            </span>
            <span className="text-[10.5px] text-muted-foreground">GEN</span>
          </div>
        </div>
        {canResolve ? (
          <button
            onClick={onResolve}
            disabled={resolving}
            className="rounded-full bg-electric px-4 py-2 text-[11.5px] font-semibold text-background hover:bg-electric/90 disabled:opacity-60"
          >
            {resolving ? "Checking…" : "Check Price →"}
          </button>
        ) : (
          !dare.pending && (
            <span className="text-[11px] text-muted-foreground opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              View →
            </span>
          )
        )}
      </div>
    </article>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.7, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      whileHover={dare.pending ? undefined : { y: -3 }}
      className="group h-full"
    >
      {dare.pending ? (
        <div className="block h-full opacity-90">{inner}</div>
      ) : (
        <Link to="/dare/$id" params={{ id: dareRouteId(dare) }} className="block h-full">
          {inner}
        </Link>
      )}
    </motion.div>
  );
}
