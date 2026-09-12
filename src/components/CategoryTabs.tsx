import { motion } from "framer-motion";
import type { DareCategory } from "@/lib/dares";

const CATEGORIES: ("All" | DareCategory)[] = ["All", "Building", "Writing", "Onchain"];

export function CategoryTabs({
  value,
  onChange,
}: {
  value: "All" | DareCategory;
  onChange: (v: "All" | DareCategory) => void;
}) {
  return (
    <div className="no-scrollbar flex gap-0.5 overflow-x-auto">
      {CATEGORIES.map((c) => {
        const active = c === value;
        return (
          <button
            key={c}
            onClick={() => onChange(c)}
            className="relative whitespace-nowrap rounded-full px-4 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-white"
          >
            {active && (
              <motion.span
                layoutId="cat-active"
                className="absolute inset-0 rounded-full bg-white/[0.06]"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className={`relative ${active ? "text-white" : ""}`}>{c}</span>
          </button>
        );
      })}
    </div>
  );
}
