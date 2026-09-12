import type { DareStatus } from "@/lib/dares";

const map: Record<DareStatus, { label: string; dot: string; text: string }> = {
  open: { label: "OPEN", dot: "bg-electric", text: "text-white" },
  submitted: { label: "SUBMITTED", dot: "bg-amber-stake", text: "text-white" },
  retryable: { label: "RETRYABLE", dot: "bg-amber-stake", text: "text-amber-stake" },
  complete: { label: "COMPLETE", dot: "bg-gen", text: "text-gen" },
  incomplete: { label: "INCOMPLETE", dot: "bg-deep-red", text: "text-deep-red" },
  refundable: { label: "REFUNDABLE", dot: "bg-electric", text: "text-electric" },
  canceled: { label: "CANCELED", dot: "bg-white/30", text: "text-muted-foreground" },
  void: { label: "VOID", dot: "bg-white/30", text: "text-muted-foreground" },
};

export function StatusBadge({
  status,
  className = "",
}: {
  status: DareStatus;
  className?: string;
}) {
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[9.5px] font-medium tracking-[0.18em] ${s.text} ${className}`}
    >
      <span className={`h-1 w-1 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
