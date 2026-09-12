import { useEffect, useState } from "react";
import { explorerTxUrl, getTrackedTxs, subscribeTxs, type TrackedTx } from "@/lib/tx-tracker";

const STATUS_COPY: Record<TrackedTx["status"], string> = {
  pending: "Waiting for consensus",
  success: "Executed onchain",
  failed: "Execution failed",
  uncertain: "Decision not observed yet",
};

const STATUS_DOT: Record<TrackedTx["status"], string> = {
  pending: "bg-amber-stake animate-pulse",
  success: "bg-lime",
  failed: "bg-deep-red",
  uncertain: "bg-amber-stake",
};

export function TransactionCenter() {
  const [transactions, setTransactions] = useState<TrackedTx[]>([]);

  useEffect(() => {
    const sync = () => setTransactions(getTrackedTxs());
    sync();
    const unsubscribe = subscribeTxs(setTransactions);
    window.addEventListener("storage", sync);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (transactions.length === 0) return null;

  return (
    <aside className="fixed bottom-4 right-4 z-[120] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-white/10 bg-[#09090b]/95 shadow-2xl backdrop-blur-xl">
      <div className="border-b border-white/[0.07] px-4 py-3">
        <div className="eyebrow">Recent transactions</div>
      </div>
      <div className="max-h-60 overflow-y-auto p-2">
        {transactions.slice(0, 4).map((transaction) => (
          <a
            key={transaction.hash}
            href={explorerTxUrl(transaction.hash)}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
          >
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[transaction.status]}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-white">
                {transaction.label}
              </span>
              <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                {STATUS_COPY[transaction.status]}
              </span>
              <span className="mt-1 block truncate font-mono text-[9.5px] text-white/40">
                {transaction.hash}
              </span>
            </span>
            <span className="mt-0.5 text-[11px] text-white/40" aria-hidden>
              ↗
            </span>
          </a>
        ))}
      </div>
      <div className="border-t border-white/[0.07] px-4 py-2 text-[10px] text-muted-foreground">
        Saved across reloads. Open a transaction for its live Studio status.
      </div>
    </aside>
  );
}
