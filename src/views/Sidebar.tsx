import { motion } from "motion/react";
import { LayoutGrid, Images, Receipt, Settings2 } from "lucide-react";
import { BravoLogo } from "../brand/Logo";
import { useMemo } from "react";
import { useCosts } from "../store/costs";
import { daysToRenew, monthStart, useBudget } from "../store/budget";
import { formatUsd } from "../lib/format";

/** Gasto do mês contra o orçamento, sempre à vista. */
function Meter({ onOpen }: { onOpen: () => void }) {
  const entries = useCosts((s) => s.entries);
  const budget = useBudget((s) => s.monthly);
  const spent = useMemo(() => {
    const from = monthStart();
    return entries.filter((e) => e.ts >= from).reduce((a, e) => a + e.usd, 0);
  }, [entries]);
  const pct = budget > 0 ? spent / budget : 0;
  return (
    <button className="meter" onClick={onOpen} title="Ver custos">
      <div className="meter-top">
        <span className="meter-value">{formatUsd(spent)}</span>
        <span className="meter-of">{budget > 0 ? `de ${formatUsd(budget)}` : "este mês"}</span>
      </div>
      <div className="meter-track">
        <motion.div className={pct > 1 ? "over" : ""} initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(pct, 1) }} transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }} />
      </div>
      <div className="meter-foot">
        <span>{budget > 0 ? `${Math.round(pct * 100)}% usado` : "sem orçamento"}</span>
        <span>renova em {daysToRenew()}d</span>
      </div>
    </button>
  );
}

export type View = "spaces" | "history" | "costs" | "settings";

const ITEMS: { id: View; label: string; icon: typeof LayoutGrid }[] = [
  { id: "spaces", label: "Spaces", icon: LayoutGrid },
  { id: "history", label: "Biblioteca", icon: Images },
  { id: "costs", label: "Custos", icon: Receipt },
  { id: "settings", label: "Ajustes", icon: Settings2 },
];

export function Sidebar({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <aside className="sidebar">
      <BravoLogo />
      <nav className="side-nav">
        {ITEMS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`side-item ${view === id ? "is-active" : ""}`} onClick={() => onChange(id)}>
            {view === id && <motion.span layoutId="side-active" className="side-active" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
            <Icon size={17} strokeWidth={1.6} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <Meter onOpen={() => onChange("costs")} />
      <div className="side-foot">
        <span>Tecnologia, sensibilidade</span>
        <span>e estratégia em cada pixel</span>
      </div>
    </aside>
  );
}
