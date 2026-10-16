import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { TemplatePicker } from "./TemplatePicker";
import { HoldButton } from "./HoldButton";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useSpaces } from "../store/spaces";
import { relativeDate } from "../lib/format";
import { MediaView } from "../canvas/nodes/controls";
import { PageHead } from "./PageHead";
import { item } from "../lib/motion";

export function SpacesHome() {
  const { spaces, open, remove, duplicate } = useSpaces();
  const [picking, setPicking] = useState(false);
  return (
    <div className="page">
      <PageHead index="001" eyebrow="Spaces" title="Fluxos de criação" lead="Conecte texto, imagem, vídeo e upscale num canvas infinito. Cada space guarda o fluxo e tudo que ele gerou.">
        <button className="btn btn-primary" onClick={() => setPicking(true)}>
          <Plus size={15} /> Novo space
        </button>
      </PageHead>

      {spaces.length === 0 ? (
        <motion.button className="empty-space" onClick={() => setPicking(true)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <span className="empty-title">Comece pelo primeiro space</span>
          <span className="empty-lead">Escolha um fluxo pronto ou comece do zero.</span>
        </motion.button>
      ) : (
        <ul className="space-list">
          {spaces.map((s, i) => {
            const cover = s.nodes.flatMap((n) => n.data.gallery ?? []).sort((a, b) => b.createdAt - a.createdAt)[0];
            return (
              <motion.li
                key={s.id}
                className="space-row"
                {...item(i)}
              >
                <button className="space-open" data-glow onClick={() => open(s.id)}>
                  <span className="space-title">{s.name}</span>
                  <span className="space-meta">
                    {s.nodes.length} nodes · editado {relativeDate(s.updatedAt)}
                  </span>
                  {cover && (
                    <span className="space-cover">
                      <MediaView media={cover} />
                    </span>
                  )}
                </button>
                <div className="space-actions">
                  <button className="icon-btn" title="Duplicar" onClick={() => duplicate(s.id)}>
                    <Copy size={15} />
                  </button>
                  <HoldButton className="icon-btn" title="Segure para excluir" onConfirm={() => remove(s.id)}>
                    <Trash2 size={15} />
                  </HoldButton>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
      <AnimatePresence>{picking && <TemplatePicker onClose={() => setPicking(false)} />}</AnimatePresence>
    </div>
  );
}
