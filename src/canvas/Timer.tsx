import { useEffect, useState } from "react";

export function formatElapsed(ms: number) {
  const total = Math.max(0, ms) / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

/** Cronômetro em mono que avança a cada décimo de segundo enquanto roda. */
export function Timer({ since, until, className = "timer" }: { since?: number; until?: number; className?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since || until) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [since, until]);
  if (!since) return null;
  return <span className={className}>{formatElapsed((until ?? now) - since)}</span>;
}
