import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useSpaces } from "../store/spaces";
import { MediaView, useLightbox } from "../canvas/nodes/controls";
import { PageHead } from "./PageHead";
import { formatDate } from "../lib/format";

type Filter = "all" | "image" | "video";

export function Library() {
  const spaces = useSpaces((s) => s.spaces);
  const open = useLightbox((s) => s.open);
  const [filter, setFilter] = useState<Filter>("all");
  const items = useMemo(() => {
    const seen = new Set<string>();
    return spaces
      .flatMap((s) => s.nodes.flatMap((n) => (n.type === "upload" ? [] : n.data.gallery ?? [])))
      .filter((m) => !seen.has(m.id) && seen.add(m.id))
      .filter((m) => filter === "all" || m.kind === filter)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [spaces, filter]);

  return (
    <div className="page">
      <PageHead index="002" eyebrow="Biblioteca" title="Tudo que foi gerado" lead="Imagens e vídeos de todos os spaces, do mais recente ao mais antigo.">
        <div className="chips">
          {(["all", "image", "video"] as Filter[]).map((f) => (
            <button key={f} className={`chip ${filter === f ? "is-active" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "Tudo" : f === "image" ? "Imagens" : "Vídeos"}
            </button>
          ))}
        </div>
      </PageHead>
      {items.length === 0 ? (
        <p className="muted">Nada por aqui ainda. Gere algo num space e aparece aqui.</p>
      ) : (
        <div className="masonry">
          {items.map((m, i) => (
            <motion.button
              key={m.id}
              className="masonry-item"
              onClick={() => open(m)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.6) }}
            >
              <MediaView media={m} />
              <span className="masonry-meta">
                {m.model} · {formatDate(m.createdAt)}
              </span>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
