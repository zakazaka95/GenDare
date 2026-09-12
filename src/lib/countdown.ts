import { useEffect, useState } from "react";

export function useCountdown(deadline: number) {
  const [diff, setDiff] = useState(() => deadline - Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setDiff(deadline - Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [deadline]);

  const past = diff < 0;
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86400);
  const h = Math.floor((abs % 86400) / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return { past, d, h, m, s, raw: diff };
}

export function formatCountdown(deadline: number) {
  const { past, d, h, m, s } = (function () {
    const diff = deadline - Math.floor(Date.now() / 1000);
    const past = diff < 0;
    const abs = Math.abs(diff);
    return {
      past,
      d: Math.floor(abs / 86400),
      h: Math.floor((abs % 86400) / 3600),
      m: Math.floor((abs % 3600) / 60),
      s: abs % 60,
    };
  })();
  if (past) return `Ended ${d ? d + "d " : ""}${h}h ago`;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
