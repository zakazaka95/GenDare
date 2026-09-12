import { Link, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ConnectButton } from "@/components/ConnectButton";

export function Navbar() {
  const { pathname } = useLocation();

  const nav = [
    { to: "/", label: "Feed" },
    { to: "/create", label: "Create" },
    { to: "/my-dares", label: "My Dares" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-background">
      <div className="mx-auto flex h-14 max-w-6xl flex-nowrap items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <img src="/gendare-mark.svg" alt="" className="h-5 w-5" />
          <span className="text-[13px] font-medium tracking-tight text-white">GenDare</span>
          <span className="hidden text-[10px] font-medium tracking-[0.22em] text-muted-foreground sm:inline">
            / TESTNET
          </span>
        </Link>

        <nav className="flex flex-nowrap items-center gap-0.5">
          {nav.map((n) => {
            const active = pathname === n.to || (n.to !== "/" && pathname.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                className="relative shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-white sm:px-3.5 sm:text-[12.5px]"
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-full bg-white/[0.06]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{n.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0">
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
