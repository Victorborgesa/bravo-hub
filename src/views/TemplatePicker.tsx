import { motion } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import { useState } from "react";
import { TEMPLATES, useSpaces } from "../store/spaces";
import { NodeIcon } from "../canvas/nodes/icons";
import { item, sheet, veil } from "../lib/motion";

/** Janela de "Novo space": nome e um ponto de partida. */
export function TemplatePicker({ onClose }: { onClose: () => void }) {
  const create = useSpaces((s) => s.create);
  const [name, setName] = useState("");
  const pick = (id: string) => {
    create(name.trim() || "Novo space", id);
    onClose();
  };
  return (
    <motion.div className="modal-backdrop" {...veil} onClick={onClose}>
      <motion.div className="modal" {...sheet} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span className="eyebrow">Novo space</span>
            <input autoFocus className="modal-name" placeholder="Nome do projeto" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="tpl-grid">
          {TEMPLATES.map((t, i) => (
            <motion.button key={t.id} className="tpl" data-glow onClick={() => pick(t.id)} {...item(i + 2)}>
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
