import { AnimatePresence, motion } from "framer-motion";
import { useWallet, shortAddress } from "@/lib/wallet";

export function ConnectButton({ compact = false }: { compact?: boolean }) {
  const { address, status, isStudioNext, connect, switchToStudioNext } = useWallet();

  const handleClick = () => {
    if (!address) return connect();
    if (!isStudioNext) return switchToStudioNext();
  };

  let label = "Connect";
  if (status === "connecting") label = "Connecting…";
  else if (status === "switching") label = "Switching network…";
  else if (address && !isStudioNext) label = "Wrong network";
  else if (address) label = shortAddress(address);

  const isLive = !!address && isStudioNext;
  const isWarn = !!address && !isStudioNext;

  return (
    <button
      onClick={handleClick}
      disabled={status === "connecting" || status === "switching"}
      className={`group relative inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-all disabled:opacity-70 ${
        isLive
          ? "border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.07]"
          : isWarn
            ? "border border-deep-red/50 bg-deep-red/10 text-white hover:bg-deep-red/20"
            : "bg-white text-background hover:bg-white/90"
      } ${compact ? "" : "sm:text-[12.5px]"}`}
    >
      {isLive && <span className="h-1.5 w-1.5 rounded-full bg-electric" />}
      {isWarn && <span className="h-1.5 w-1.5 rounded-full bg-deep-red" />}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="font-mono tabular-nums"
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export function InstallWalletModal() {
  const { showInstallModal, dismissInstallModal } = useWallet();
  return (
    <AnimatePresence>
      {showInstallModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={dismissInstallModal}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-10 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]"
          >
            <div
              className="pointer-events-none absolute inset-x-0 -top-24 h-48"
              style={{
                background:
                  "radial-gradient(50% 100% at 50% 0%, rgba(255,255,255,0.06), transparent 70%)",
              }}
            />
            <div className="relative">
              <div className="eyebrow">Wallet required</div>
              <h2 className="mt-5 text-[28px] font-semibold leading-tight tracking-tight text-white">
                Install Rabby or MetaMask.
              </h2>
              <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground">
                GenDare runs on GenLayer Studio Next. You need an injected EVM wallet to stake,
                support, or challenge a dare.
              </p>

              <div className="mt-8 space-y-2.5">
                <a
                  href="https://rabby.io/"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 transition-colors hover:bg-white/[0.05]"
                >
                  <div>
                    <div className="text-[13.5px] font-semibold text-white">Rabby Wallet</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      Recommended · rabby.io
                    </div>
                  </div>
                  <span className="text-muted-foreground">→</span>
                </a>
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 transition-colors hover:bg-white/[0.05]"
                >
                  <div>
                    <div className="text-[13.5px] font-semibold text-white">MetaMask</div>
                    <div className="text-[11.5px] text-muted-foreground">metamask.io</div>
                  </div>
                  <span className="text-muted-foreground">→</span>
                </a>
              </div>

              <button
                onClick={dismissInstallModal}
                className="mt-8 text-[11.5px] tracking-[0.2em] text-muted-foreground hover:text-white"
              >
                CLOSE
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
