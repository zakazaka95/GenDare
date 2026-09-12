import { Link } from "@tanstack/react-router";
import { CONTRACT_ADDRESS } from "@/lib/contract";

const CONTRACT_EXPLORER_URL = `https://explorer-studio-dev.genlayer.com/address/${CONTRACT_ADDRESS}`;

export function Footer() {
  return (
    <footer className="relative z-10 mt-40 border-t border-white/[0.05]">
      <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <div className="flex flex-col items-start justify-between gap-10 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/gendare-mark.svg" alt="" className="h-5 w-5" />
              <span className="text-[13px] font-medium tracking-tight text-white">GenDare</span>
            </div>
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
              Public accountability, settled by independent GenLayer validators.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-14 gap-y-2.5 text-[12px] sm:grid-cols-3">
            <Link to="/" className="text-muted-foreground transition-colors hover:text-white">
              Feed
            </Link>
            <Link to="/create" className="text-muted-foreground transition-colors hover:text-white">
              Create
            </Link>
            <Link
              to="/my-dares"
              className="text-muted-foreground transition-colors hover:text-white"
            >
              My dares
            </Link>
            <a
              href="https://github.com/zakazaka95/GenDare#readme"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground transition-colors hover:text-white"
            >
              Docs
            </a>
            <a
              href="https://genlayer.com/"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground transition-colors hover:text-white"
            >
              GenLayer
            </a>
            <a
              href={CONTRACT_EXPLORER_URL}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground transition-colors hover:text-white"
            >
              Contract
            </a>
          </div>
        </div>
        <div className="mt-14 flex flex-col items-start justify-between gap-2 border-t border-white/[0.05] pt-6 text-[11px] text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} GenDare</span>
          <span className="font-mono">
            Studio Devnet · {CONTRACT_ADDRESS.slice(0, 6)}…{CONTRACT_ADDRESS.slice(-4)}
          </span>
        </div>
      </div>
    </footer>
  );
}
