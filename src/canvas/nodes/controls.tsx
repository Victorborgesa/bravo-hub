import { motion, AnimatePresence } from "motion/react";
import { Download, Expand } from "lucide-react";
import { create } from "zustand";
import { PROVIDERS, modelsFor } from "../../providers/catalog";
import type { Capability, ModelDef, ProviderId } from "../../providers/types";
import { exportToDownloads } from "../../lib/platform";
import { mediaFileName, type MediaRef } from "../../lib/media";
import { notify } from "../../store/toasts";

export function ModelSelect({ capability, value, onChange }: { capability: Capability; value?: string; onChange: (id: string) => void }) {
  const groups = new Map<ProviderId, ModelDef[]>();
  for (const m of modelsFor(capability)) groups.set(m.provider, [...(groups.get(m.provider) ?? []), m]);
  return (
    <select className="field nodrag" value={value} onChange={(e) => onChange(e.target.value)}>
      {[...groups].map(([provider, models]) => (
        <optgroup key={provider} label={PROVIDERS[provider].name}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} · ~US$ {m.price.usd}/{m.price.unit}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function Chips<T extends string | number>({ options, value, onChange, format }: { options: T[]; value?: T; onChange: (v: T) => void; format?: (v: T) => string }) {
  return (
    <div className="chips nodrag">
      {options.map((o) => (
        <button key={String(o)} className={`chip ${o === value ? "is-active" : ""}`} onClick={() => onChange(o)}>
          {format ? format(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field-wrap">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

// Visualizador em tela cheia compartilhado por todos os nodes.
export const useLightbox = create<{ media: MediaRef | null; open: (m: MediaRef | null) => void }>()((set) => ({
  media: null,
  open: (media) => set({ media }),
}));

export async function downloadMedia(m: MediaRef) {
  try {
    const where = await exportToDownloads(m, mediaFileName(m));
    notify(`Salvo em ${where}`, "ok");
  } catch (e) {
    notify(`Não consegui salvar: ${e instanceof Error ? e.message : e}`, "error");
  }
}

export function MediaView({ media, className = "" }: { media: MediaRef; className?: string }) {
  return media.kind === "video" ? (
    <video className={className} src={media.url} muted loop playsInline autoPlay />
  ) : (
    <img className={className} src={media.url} alt={media.prompt ?? ""} draggable={false} />
  );
}

/** Prévia principal + miniaturas. Clicar numa miniatura define a saída do node. */
export function Gallery({ items, selectedId, onSelect, empty }: { items: MediaRef[]; selectedId?: string; onSelect: (m: MediaRef) => void; empty: string }) {
  const open = useLightbox((s) => s.open);
  const main = items.find((m) => m.id === selectedId) ?? items[0];
  if (!main) return <div className="gallery-empty">{empty}</div>;
  return (
    <div className="gallery nodrag">
      <div className="gallery-main">
        <AnimatePresence mode="wait">
          <motion.div key={main.id} className="gallery-frame" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <MediaView media={main} />
          </motion.div>
        </AnimatePresence>
        <div className="gallery-actions">
          <button className="icon-btn" title="Ampliar" onClick={() => open(main)}>
            <Expand size={14} />
          </button>
          <button className="icon-btn" title="Baixar" onClick={() => downloadMedia(main)}>
            <Download size={14} />
          </button>
        </div>
      </div>
      {items.length > 1 && (
        <div className="gallery-strip nowheel">
          {items.map((m) => (
            <button key={m.id} className={`thumb ${m.id === main.id ? "is-active" : ""}`} onClick={() => onSelect(m)}>
              <MediaView media={m} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
