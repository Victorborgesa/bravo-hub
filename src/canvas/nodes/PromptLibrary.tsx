import { AnimatePresence, motion } from "motion/react";
import { BookMarked, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePrompts, type SavedPrompt } from "../../store/prompts";

/** Botão que abre os prompts salvos da Bravo: inserir, salvar o atual e apagar. */
export function PromptLibrary({ kind, current, onInsert }: { kind: SavedPrompt["kind"]; current: string; onInsert: (text: string) => void }) {
  const { prompts, add, remove } = usePrompts();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const term = q.trim().toLowerCase();
  const list = prompts.filter((p) => p.kind === kind && (!term || `${p.title} ${p.text}`.toLowerCase().includes(term)));

  const save = () => {
    if (!title.trim() || !current.trim()) return;
    add({ title: title.trim(), text: current.trim(), kind });
    setTitle("");
    setNaming(false);
  };

  return (
    <div className="prompt-lib nodrag nowheel" ref={ref}>
      <button className={`icon-btn lib-btn ${open ? "is-open" : ""}`} title="Biblioteca de prompts" onClick={() => setOpen((o) => !o)}>
        <BookMarked size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="popover lib-pop" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.18 }}>
            <label className="menu-search">
              <Search size={14} />
              <input autoFocus placeholder="Buscar prompt" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <div className="menu-scroll lib-scroll">
              {list.map((p) => (
                <div key={p.id} className="lib-row">
                  <button className="lib-pick" onClick={() => { onInsert(p.text); setOpen(false); }}>
                    <span>{p.title}</span>
                    <small>{p.text}</small>
                  </button>
                  <button className="icon-btn" title="Apagar" onClick={() => remove(p.id)}><Trash2 size={12} /></button>
                </div>
              ))}
              {!list.length && <div className="menu-empty">Nenhum prompt salvo</div>}
            </div>
            <footer className="lib-foot">
              {naming ? (
                <div className="lib-save">
                  <input autoFocus className="field" placeholder="Nome do prompt" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
                  <button className="btn btn-primary small" onClick={save} disabled={!title.trim()}>Salvar</button>
                </div>
              ) : (
                <button className="add-row" disabled={!current.trim()} onClick={() => setNaming(true)}>
                  <Plus size={13} /> {current.trim() ? "Salvar o prompt atual" : "Escreva um prompt para salvar"}
                </button>
              )}
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
