import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { DareCard } from "@/components/DareCard";
import { adaptOnchain, type Dare } from "@/lib/dares";
import { getAllDares, type OnchainDare } from "@/lib/contract";
import { useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/my-dares")({
  head: () => ({
    meta: [
      { title: "My Dares — GenDare" },
      { name: "description", content: "Your active dares, evidence queue and AI verdicts." },
    ],
  }),
  component: MyDares,
});

function MyDares() {
  const wallet = useWallet();
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<Dare[]>([]);
  const [participating, setParticipating] = useState<Dare[]>([]);

  useEffect(() => {
    if (!wallet.address) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async (initial: boolean) => {
      try {
        const all = await getAllDares();
        const me = wallet.address!.toLowerCase();
        const isMine = (d: OnchainDare) => d.darer.toLowerCase() === me;
        const isParticipating = (d: OnchainDare) =>
          !isMine(d) &&
          (d.supporters.some((p) => p.address.toLowerCase() === me) ||
            d.challengers.some((p) => p.address.toLowerCase() === me));
        if (cancelled) return;
        setMine(all.filter(isMine).map(adaptOnchain));
        setParticipating(all.filter(isParticipating).map(adaptOnchain));
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    };
    load(true);
    const id = setInterval(() => load(false), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [wallet.address]);

  return (
    <div className="relative min-h-screen">
      <AmbientBackground />
      <Navbar />

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-32 pt-24 sm:pt-32">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="eyebrow">Your ledger</div>
          <div className="mt-6 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <h1 className="headline text-[52px] sm:text-[80px]">My dares.</h1>
            <Link
              to="/create"
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[12.5px] font-semibold text-background transition-all hover:bg-white/90"
            >
              + New dare
            </Link>
          </div>
        </motion.div>

        {!wallet.address ? (
          <EmptyState
            title="Connect your wallet."
            body="Sign in with Rabby or MetaMask to see your dares."
          />
        ) : loading ? (
          <div className="mt-16 text-[13px] text-muted-foreground">Loading your ledger…</div>
        ) : mine.length === 0 && participating.length === 0 ? (
          <EmptyState
            title="No dares on your ledger."
            body="Your reputation is still neutral. Stake on a goal and let the validators write history."
          />
        ) : (
          <div className="mt-16 space-y-20">
            <Section title="Created" dares={mine} />
            <Section title="Backing & challenging" dares={participating} />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

function Section({ title, dares }: { title: string; dares: Dare[] }) {
  if (dares.length === 0) return null;
  return (
    <div>
      <div className="eyebrow">{title}</div>
      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {dares.map((d, i) => (
          <DareCard key={d.id} dare={d} index={i} />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      className="relative mt-16 overflow-hidden rounded-2xl border border-white/[0.05] bg-[#080808] px-8 py-24 sm:py-32"
    >
      <div
        className="pointer-events-none absolute inset-x-0 -top-32 h-64"
        style={{
          background:
            "radial-gradient(50% 100% at 50% 0%, rgba(255,255,255,0.05), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.08]">
          <span className="h-1.5 w-1.5 rounded-full bg-electric" />
        </div>
        <h3 className="mt-10 text-[28px] font-semibold tracking-tight text-white sm:text-[34px]">
          {title}
        </h3>
        <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">{body}</p>
        <Link
          to="/create"
          className="mt-10 inline-flex items-center gap-2.5 rounded-full bg-white px-6 py-3 text-[12.5px] font-semibold text-background transition-all hover:bg-white/90"
        >
          Create a dare
          <span aria-hidden>→</span>
        </Link>
      </div>
    </motion.div>
  );
}
