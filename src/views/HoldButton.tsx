import { useRef, useState, type ReactNode } from "react";

/**
 * Botão de ação destrutiva: precisa ficar pressionado até encher.
 * Dá peso à ação sem uma janela de confirmação no meio do caminho.
 */
export function HoldButton({ onConfirm, children, ms = 1200, className = "", title }: { onConfirm: () => void; children: ReactNode; ms?: number; className?: string; title?: string }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = () => {
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, ms);
  };
  const stop = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };
  return (
    <button
      className={`hold ${holding ? "is-holding" : ""} ${className}`}
      style={{ ["--hold-ms" as string]: `${ms}ms` }}
      title={title}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !holding && start()}
      onKeyUp={stop}
    >
      <span className="hold-fill" />
      <span className="hold-label">{children}</span>
    </button>
  );
}
