import { motion } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import { useState } from "react";
import { TEMPLATES, useSpaces } from "../store/spaces";
import { NodeIcon } from "../canvas/nodes/icons";

/** Janela de "Novo space": nome e um ponto de partida. */
export function TemplatePicker({ onClose }: { onClose: () => void }) {
  const create = useSpaces((s) => s.create);
  const [name, setName] = useState("");
  const pick = (id: string) => {
    create(name.trim() || "Novo space", id);
    onClose();
  };
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="modal" initial={{ y: 16, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span className="eyebrow">Novo space</span>
            <input autoFocus className="modal-name" placeholder="Nome do projeto" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="tpl-grid">
          {TEMPLATES.map((t, i) => (
            <motion.button key={t.id} className="tpl" onClick={() => pick(t.id)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
              <span className="tpl-flow">
                {t.steps.length ? t.steps.map((k, j) => (
                  <span key={j} className="tpl-step">
                    {j > 0 && <ArrowRight size={11} className="tpl-arrow" />}
                    <span className="tpl-icon"><NodeIcon kind={k} size={14} /></span>
                  </span>
                )) : <span className="tpl-empty">+</span>}
              </span>
              <span className="tpl-title">{t.title}</span>
              <span className="tpl-desc">{t.description}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
