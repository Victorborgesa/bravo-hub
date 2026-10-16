import { motion } from "motion/react";
import { LayoutGrid, Images, Receipt, Settings2 } from "lucide-react";
import { BravoLogo } from "../brand/Logo";

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
      <div className="side-foot">
        <span>Tecnologia, sensibilidade</span>
        <span>e estratégia em cada pixel</span>
      </div>
    </aside>
  );
}
