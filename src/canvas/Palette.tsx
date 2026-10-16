import { motion } from "motion/react";
import { Search, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NodeIcon } from "./nodes/icons";
import { NODE_SPECS, type NodeCategory, type NodeKind } from "./ports";

export type PaletteChoice = { kind: NodeKind; pickFiles?: boolean };

interface Item {
  key: string;
  label: string;
  hint: string;
  section: "Mídia" | "Nós";
  category: NodeCategory;
  choice: PaletteChoice;
}

const ITEMS: Item[] = [
  { key: "carregar", label: "Carregar", hint: "Imagens do computador", section: "Mídia", category: "Mídia", choice: { kind: "upload", pickFiles: true } },
  ...(["image", "video", "assistant", "text", "list", "upscale", "upload"] as NodeKind[]).map((kind) => ({
    key: kind,
    label: kind === "upload" ? "Node de upload vazio" : NODE_SPECS[kind].title,
    hint: NODE_SPECS[kind].category,
    section: "Nós" as const,
    category: NODE_SPECS[kind].category,
    choice: { kind },
  })),
];

const FILTERS: ("Tudo" | NodeCategory)[] = ["Tudo", "Imagem", "Vídeo", "Texto", "Utilitários", "Mídia"];

/** Menu de inserção aberto pelo botão direito, pelo "+" ou pela tecla N. */
export function Palette({ x, y, onPick, onClose }: { x: number; y: number; onPick: (c: PaletteChoice) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Tudo");
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return ITEMS.filter((i) => (filter === "Tudo" || i.category === filter) && (!term || `${i.label} ${i.hint}`.toLowerCase().includes(term)));
  }, [q, filter]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);

  // Mantém o menu dentro da janela.
  const left = Math.min(x, window.innerWidth - 340);
  const top = Math.min(y, window.innerHeight - 470);

  const pick = (i: Item) => {
    onPick(i.choice);
    onClose();
  };

  let index = -1;
  const section = (name: Item["section"]) => {
    const rows = items.filter((i) => i.section === name);
    if (!rows.length) return null;
    return (
      <div key={name}>
        <div className="menu-section">{name}</div>
        {rows.map((i) => {
          index++;
          const n = index;
          return (
            <button key={i.key} className={`menu-row tall ${n === cursor ? "is-cursor" : ""}`} onMouseEnter={() => setCursor(n)} onClick={() => pick(i)}>
              <span className={`menu-icon cat-${i.category}`}>{i.key === "carregar" ? <Upload size={14} /> : <NodeIcon kind={i.choice.kind} size={14} />}</span>
              <span className="menu-text">
                <span>{i.label}</span>
                <small>{i.hint}</small>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <motion.div
      ref={ref}
      className="palette"
      style={{ left, top }}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, items.length - 1));
        else if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
        else if (e.key === "Enter" && items[cursor]) pick(items[cursor]);
        else if (e.key === "Escape") onClose();
        else return;
        e.preventDefault();
      }}
    >
      <label className="menu-search big">
        <Search size={16} />
        <input autoFocus placeholder="Pesquisar" value={q} onChange={(e) => { setQ(e.target.value); setCursor(0); }} />
      </label>
      <div className="palette-filters">
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${filter === f ? "is-active" : ""}`} onClick={() => { setFilter(f); setCursor(0); }}>
            {f}
          </button>
        ))}
      </div>
      <div className="menu-scroll">
        {section("Mídia")}
        {section("Nós")}
        {items.length === 0 && <div className="menu-empty">Nada encontrado</div>}
      </div>
      <footer className="palette-foot">
        <span><kbd>N</kbd> Abrir</span>
        <span><kbd>↑↓</kbd> Navegar</span>
        <span><kbd>↵</kbd> Inserir</span>
      </footer>
    </motion.div>
  );
}
