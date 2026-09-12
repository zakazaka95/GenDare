import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { DareCard } from "@/components/DareCard";
import { CategoryTabs } from "@/components/CategoryTabs";
import { adaptOnchain, type Dare, type DareCategory } from "@/lib/dares";
import { getAllDares } from "@/lib/contract";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GenDare — Stake Your Reputation Onchain" },
      {
        name: "description",
        content:
          "Public accountability settled by independent GenLayer validators. Stake test GEN on verifiable price calls and public goals.",
      },
      { property: "og:title", content: "GenDare — Stake Your Reputation" },
      {
        property: "og:description",
        content: "Onchain accountability dares decided by AI consensus.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function Hero() {
  const stages = [
    "Claim locked",
    "Evidence submitted",
    "Validator consensus",
    "Onchain settlement",
  ];

  return (
    <section className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-20 sm:px-8 sm:pb-20 sm:pt-28">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="inline-flex items-center gap-2.5 font-mono text-[10px] font-medium tracking-[0.2em] text-muted-foreground"
          >
            <span className="status-breathe h-1.5 w-1.5 rounded-full bg-lime" />
            LIVE ON STUDIO DEVNET
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            className="headline mt-7 max-w-3xl text-[50px] sm:text-[72px] lg:text-[78px]"
          >
            Stake the claim.
            <br />
            Prove the outcome.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.3 }}
            className="mt-7 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]"
          >
            Create a public commitment, lock GEN behind it, and let independent GenLayer validators
            settle the evidence.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.45 }}
            className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Link
              to="/create"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-md bg-lime px-6 text-[12px] font-bold tracking-[0.08em] text-background transition-colors hover:bg-lime/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              CREATE A DARE
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link
              to="/"
              hash="feed"
              className="inline-flex min-h-12 items-center justify-center gap-2 px-3 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
            >
              EXPLORE LIVE DARES <span aria-hidden>↓</span>
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
          className="relative mx-auto w-full max-w-lg lg:justify-self-end"
        >
          <div className="border border-white/12 bg-card p-5 sm:p-7">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <div className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground">
                  HOW IT WORKS
                </div>
                <div className="mt-2 text-[16px] font-semibold text-foreground">
                  Settlement preview
                </div>
              </div>
              <span className="inline-flex items-center gap-2 font-mono text-[9px] tracking-[0.12em] text-lime">
                <span className="status-breathe h-1.5 w-1.5 rounded-full bg-lime" /> ACTIVE
              </span>
            </div>
            <div className="py-6">
              {stages.map((stage, index) => (
                <div key={stage} className="grid grid-cols-[18px_1fr] gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-0.5 h-2 w-2 rounded-full border ${index === 0 ? "border-lime bg-lime" : "border-white/25 bg-card"}`}
                    />
                    {index < stages.length - 1 && (
                      <span className="relative my-1 h-8 w-px overflow-hidden bg-white/10">
                        {index === 0 && (
                          <span className="protocol-progress absolute inset-0 bg-lime" />
                        )}
                      </span>
                    )}
                  </div>
                  <div
                    className={`pb-5 font-mono text-[10px] tracking-[0.13em] ${index === 0 ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {stage.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
            <a
              href="https://explorer-studio-dev.genlayer.com/address/0x5eA37668c8c8F1313d4294C349a7eC8585071135"
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center justify-between border-t border-white/10 pt-5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
            >
              <span className="font-mono text-[9px] tracking-[0.14em]">STUDIO DEVNET</span>
              <span className="flex items-center gap-2 font-mono text-[10px]">
                0x5eA3…1135 <ExternalLink size={13} />
              </span>
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "CREATE", d: "Define an exact outcome and deadline." },
    { n: "02", t: "STAKE", d: "Lock GEN behind the claim." },
    { n: "03", t: "PROVE", d: "Submit public evidence." },
    { n: "04", t: "SETTLE", d: "Validators decide; the contract pays." },
  ];
  return (
    <section className="relative z-10 border-y border-white/10">
      <div className="mx-auto grid max-w-6xl grid-cols-1 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        {steps.map((s, i) => (
          <motion.div
            key={s.n}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.8, delay: i * 0.08 }}
            className="relative border-b border-white/10 py-6 sm:px-5 lg:border-b-0 lg:border-r lg:last:border-r-0"
          >
            <div className="font-mono text-[10px] tracking-[0.18em] text-lime">{s.n}</div>
            <h3 className="mt-4 text-[12px] font-semibold tracking-[0.1em] text-foreground">
              {s.t}
            </h3>
            <p className="mt-2 max-w-[15rem] text-[12px] leading-relaxed text-muted-foreground">
              {s.d}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function WhyGenLayer() {
  return (
    <section className="relative z-10 mx-auto grid max-w-6xl gap-8 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:items-end">
      <div>
        <div className="eyebrow">Why GenLayer</div>
        <h2 className="headline mt-4 max-w-2xl text-[38px] sm:text-[54px]">
          Evidence is messy. Settlement cannot be.
        </h2>
      </div>
      <div>
        <p className="max-w-xl text-[14px] leading-relaxed text-muted-foreground">
          Links, releases and real-world proof need interpretation. Independent validators read the
          same evidence and reach one result the contract can enforce.
        </p>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 border-t border-white/10 pt-5 font-mono text-[9px] tracking-[0.14em] text-foreground">
          <span>PUBLIC EVIDENCE</span>
          <span>INDEPENDENT VALIDATORS</span>
          <span>ONCHAIN PAYOUTS</span>
        </div>
      </div>
    </section>
  );
}

function EmptyFeed() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      className="relative mt-8 border border-white/10 bg-card px-6 py-12 sm:px-10 sm:py-14"
    >
      <div className="relative mx-auto max-w-xl text-center">
        <span className="mx-auto block h-1.5 w-1.5 rounded-full bg-lime" />
        <h3 className="mt-6 text-[26px] font-semibold tracking-tight text-foreground sm:text-[30px]">
          No active dares yet.
        </h3>
        <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
          The feed is empty. Stake your reputation first — create the dare everyone watches.
        </p>
        <Link
          to="/create"
          className="mt-7 inline-flex min-h-12 items-center gap-2.5 rounded-md bg-lime px-6 text-[11px] font-bold tracking-[0.08em] text-background transition-colors hover:bg-lime/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
        >
          CREATE THE FIRST DARE
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </motion.div>
  );
}

function FeedSkeleton() {
  return (
    <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="surface-elevated relative overflow-hidden rounded-xl p-7">
          <div className="h-3 w-20 rounded-full bg-white/[0.04] shimmer" />
          <div className="mt-6 h-5 w-3/4 rounded-md bg-white/[0.04] shimmer" />
          <div className="mt-2 h-5 w-1/2 rounded-md bg-white/[0.04] shimmer" />
          <div className="mt-10 grid grid-cols-3 gap-4 border-t border-white/[0.05] pt-6">
            <div className="h-6 rounded bg-white/[0.04] shimmer" />
            <div className="h-6 rounded bg-white/[0.04] shimmer" />
            <div className="h-6 rounded bg-white/[0.04] shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FeedReadError({ retry }: { retry: () => void }) {
  return (
    <div className="mt-10 border border-amber-stake/25 bg-amber-stake/[0.05] px-6 py-10 text-center sm:px-10">
      <div className="eyebrow text-amber-stake">Network read interrupted</div>
      <h3 className="mt-5 text-[24px] font-semibold text-white">
        The onchain feed is temporarily unavailable.
      </h3>
      <p className="mx-auto mt-3 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
        Studio Devnet did not return the records. No dare has been removed, and an empty response is
        never presented as an empty feed.
      </p>
      <button
        type="button"
        onClick={retry}
        className="mt-7 min-h-11 rounded-md bg-lime px-5 text-[11px] font-bold tracking-[0.08em] text-background"
      >
        RETRY ONCHAIN READ
      </button>
    </div>
  );
}

function Feed() {
  const [cat, setCat] = useState<"All" | DareCategory>("All");
  const [loading, setLoading] = useState(true);
  const [dares, setDares] = useState<Dare[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async (initial: boolean) => {
      try {
        const onchain = await getAllDares();
        if (cancelled) return;
        setDares(onchain.map(adaptOnchain));
        setLoadError(false);
      } catch (err) {
        console.error("Failed to load dares", err);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    };
    load(true);
    const id = setInterval(() => load(false), 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [retryNonce]);

  // Feed is built exclusively from accepted on-chain records, deduped strictly
  // by stable on-chain id (dare kind + contract id) — never by fuzzy fields.
  // Pending create transactions are tracked in the TransactionCenter only.
  const merged = (() => {
    const seen = new Set<string>();
    return dares.filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
  })();
  const publicDares = merged.filter((d) => d.isPublic);
  const priceDares = publicDares.filter((d) => d.dareType === "price");
  const goalDares = publicDares.filter((d) => d.dareType !== "price");
  const filtered = cat === "All" ? goalDares : goalDares.filter((d) => d.category === cat);

  return (
    <section
      id="feed"
      className="relative z-10 mx-auto max-w-6xl scroll-mt-28 px-5 pb-8 pt-16 sm:px-8 sm:pt-20"
    >
      {loadError && dares.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-stake/25 bg-amber-stake/[0.05] px-4 py-3 text-[11.5px] text-white/75">
          <span>Studio Devnet is temporarily unavailable. Showing the last confirmed feed.</span>
          <button
            type="button"
            onClick={() => setRetryNonce((value) => value + 1)}
            className="font-semibold text-amber-stake"
          >
            Retry read
          </button>
        </div>
      )}
      {/* Featured Price Dares */}
      {priceDares.length > 0 && (
        <div className="mb-24">
          <div className="flex items-end justify-between gap-6">
            <div>
              <div className="eyebrow">Featured</div>
              <h2 className="headline mt-5 text-[36px] sm:text-[52px]">💰 Price dares</h2>
            </div>
            <Link
              to="/create"
              className="hidden rounded-full border border-electric/30 px-4 py-2 text-[11.5px] font-semibold text-electric hover:border-electric/60 sm:inline-flex"
            >
              + Price call
            </Link>
          </div>
          <div className="no-scrollbar mt-10 flex gap-5 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
            {priceDares.map((d, i) => (
              <div key={d.id} className="w-[300px] flex-shrink-0 sm:w-auto">
                <DareCard dare={d} index={i} variant="price" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <div className="eyebrow">Live feed</div>
          <h2 className="headline mt-4 text-[40px] sm:text-[56px]">Bets in motion.</h2>
        </div>
        <Link
          to="/create"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-lime px-5 text-[11px] font-bold tracking-[0.08em] text-background transition-colors hover:bg-lime/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
        >
          + New dare
        </Link>
      </div>

      {(loading || goalDares.length > 0) && (
        <div className="mt-12 border-y border-white/[0.05] py-3">
          <CategoryTabs value={cat} onChange={setCat} />
        </div>
      )}

      {loading ? (
        <FeedSkeleton />
      ) : loadError && dares.length === 0 ? (
        <FeedReadError retry={() => setRetryNonce((value) => value + 1)} />
      ) : filtered.length === 0 ? (
        <EmptyFeed />
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d, i) => (
            <DareCard key={d.id} dare={d} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function Home() {
  return (
    <div className="relative min-h-screen">
      <Navbar />
      <main className="relative">
        <Hero />
        <HowItWorks />
        <WhyGenLayer />
        <Feed />
      </main>
      <Footer />
    </div>
  );
}
