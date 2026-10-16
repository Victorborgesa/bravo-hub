import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Download, Expand, Minus, Plus, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { AUTO_ID, FEATURED, PROVIDERS, modelById, modelsFor } from "../../providers/catalog";
import type { Capability, ModelDef } from "../../providers/types";
import { useModelOverrides } from "../../store/models";
import { exportToDownloads } from "../../lib/platform";
import { mediaFileName, type MediaRef } from "../../lib/media";
import { notify } from "../../store/toasts";

// ---------- Estado compartilhado ----------

/** Visualizador em tela cheia compartilhado por todos os nodes. */
export const useLightbox = create<{ media: MediaRef | null; open: (m: MediaRef | null) => void }>()((set) => ({
  media: null,
  open: (media) => set({ media }),
}));

/** Node aberto no painel lateral de configurações. */
export const useInspector = create<{ nodeId: string | null; open: (id: string | null) => void }>()((set) => ({
  nodeId: null,
  open: (nodeId) => set({ nodeId }),
}));

export async function downloadMedia(m: MediaRef) {
  try {
    const where = await exportToDownloads(m, mediaFileName(m));
    notify(`Salvo em ${where}`, "ok");
  } catch (e) {
    notify(`Não consegui salvar: ${e instanceof Error ? e.message : e}`, "error");
  }
}

export function MediaView({ media, className = "", controls = false }: { media: MediaRef; className?: string; controls?: boolean }) {
  return media.kind === "video" ? (
    <video className={className} src={media.url} muted={!controls} loop playsInline autoPlay controls={controls} />
  ) : (
    <img className={className} src={media.url} alt={media.prompt ?? ""} draggable={false} />
  );
}

// ---------- Popover ----------

const pop = {
  initial: { opacity: 0, y: 6, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 4, scale: 0.98 },
  transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
};

/** Botão em formato de pílula que abre um painel flutuante dentro do node. */
export function Popover({ trigger, children, align = "left", width = 260, className = "" }: { trigger: (open: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right" | "center"; width?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className={`popover-anchor nodrag nowheel ${className}`} ref={ref}>
      <button type="button" className={`pill ${open ? "is-open" : ""}`} onClick={() => setOpen((o) => !o)}>
        {trigger(open)}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className={`popover align-${align}`} style={{ width }} {...pop}>
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Seletor de modelo ----------

export function modelLabel(id?: string) {
  if (!id || id === AUTO_ID) return "Auto";
  return modelById(id)?.label ?? "Auto";
}

function ModelList({ capability, value, onChange, close }: { capability: Capability; value?: string; onChange: (id: string) => void; close: () => void }) {
  useModelOverrides((s) => s.apiIds);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const all = modelsFor(capability);
  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    const match = (m: ModelDef) => !term || `${m.label} ${PROVIDERS[m.provider].name}`.toLowerCase().includes(term);
    const featured = (FEATURED[capability] ?? []).map((id) => all.find((m) => m.id === id)).filter((m): m is ModelDef => !!m && match(m));
    const rest = all.filter((m) => match(m) && !featured.includes(m));
    const auto = !term || "auto".includes(term) ? [{ id: AUTO_ID, label: "Auto" } as ModelDef] : [];
    return { featured: [...auto, ...featured], rest };
  }, [q, all, capability]);
  const flat = [...items.featured, ...items.rest];

  const pick = (id: string) => {
    onChange(id);
    close();
  };

  const row = (m: ModelDef, i: number) => (
    <button
      key={m.id}
      className={`menu-row ${i === cursor ? "is-cursor" : ""} ${(value ?? AUTO_ID) === m.id ? "is-active" : ""}`}
      onMouseEnter={() => setCursor(i)}
      onClick={() => pick(m.id)}
    >
      <span className="menu-icon">{m.id === AUTO_ID ? <Sparkles size={13} /> : <span className={`prov-dot prov-${m.provider}`} />}</span>
      <span className="menu-text">
        <span>{m.label}</span>
        <small>{m.id === AUTO_ID ? "Escolhe o melhor modelo para o fluxo" : `${PROVIDERS[m.provider].name.split(" ")[0]} · ~US$ ${m.price.usd}/${m.price.unit}`}</small>
      </span>
      {(value ?? AUTO_ID) === m.id && <Check size={13} />}
    </button>
  );

  return (
    <div
      className="menu"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, flat.length - 1));
        else if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
        else if (e.key === "Enter" && flat[cursor]) pick(flat[cursor].id);
        else return;
        e.preventDefault();
      }}
    >
      <label className="menu-search">
        <Search size={14} />
        <input autoFocus placeholder="Pesquisar" value={q} onChange={(e) => { setQ(e.target.value); setCursor(0); }} />
      </label>
      <div className="menu-scroll">
        {items.featured.length > 0 && <div className="menu-section">Em destaque</div>}
        {items.featured.map((m, i) => row(m, i))}
        {items.rest.length > 0 && <div className="menu-section">Todos os modelos</div>}
        {items.rest.map((m, i) => row(m, i + items.featured.length))}
        {flat.length === 0 && <div className="menu-empty">Nenhum modelo encontrado</div>}
      </div>
    </div>
  );
}

export function ModelPicker({ capability, value, onChange, align = "left" }: { capability: Capability; value?: string; onChange: (id: string) => void; align?: "left" | "right" | "center" }) {
  return (
    <Popover align={align} width={280} trigger={() => <>{modelLabel(value)} <ChevronDown size={12} /></>}>
      {(close) => <ModelList capability={capability} value={value} onChange={onChange} close={close} />}
    </Popover>
  );
}

// ---------- Proporção ----------

export function AspectIcon({ aspect }: { aspect: string }) {
  const [w, h] = aspect.split(":").map(Number);
  const s = 11 / Math.max(w, h);
  return <span className="aspect-icon" style={{ width: Math.max(4, w * s), height: Math.max(4, h * s) }} />;
}

export function AspectPicker({ options, value, onChange }: { options: string[]; value?: string; onChange: (v: string) => void }) {
  const current = value && options.includes(value) ? value : options[0];
  return (
    <Popover align="center" width={120} trigger={() => <><AspectIcon aspect={current} /> {current} <ChevronDown size={12} /></>}>
      {(close) => (
        <div className="menu compact">
          {options.map((o) => (
            <button key={o} className={`menu-row ${o === current ? "is-active" : ""}`} onClick={() => { onChange(o); close(); }}>
              <span className="menu-icon"><AspectIcon aspect={o} /></span>
              <span className="menu-text"><span>{o}</span></span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

/** Lista simples de opções em pílula (duração, modo, escala…). */
export function OptionPicker<T extends string | number>({ options, value, onChange, format, icon }: { options: { value: T; label?: string }[]; value?: T; onChange: (v: T) => void; format?: (v: T) => string; icon?: ReactNode }) {
  const label = (v?: T) => options.find((o) => o.value === v)?.label ?? (v != null ? (format ? format(v) : String(v)) : "—");
  return (
    <Popover align="center" width={170} trigger={() => <>{icon}{label(value)} <ChevronDown size={12} /></>}>
      {(close) => (
        <div className="menu compact">
          {options.map((o) => (
            <button key={String(o.value)} className={`menu-row ${o.value === value ? "is-active" : ""}`} onClick={() => { onChange(o.value); close(); }}>
              <span className="menu-text"><span>{label(o.value)}</span></span>
              {o.value === value && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

export function Stepper({ value, min = 1, max = 4, onChange }: { value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper nodrag">
      <button disabled={value <= min} onClick={() => onChange(value - 1)}><Minus size={12} /></button>
      <span>x{value}</span>
      <button disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={12} /></button>
    </div>
  );
}

// ---------- Prévia de mídia ----------

/** Prévia principal + miniaturas. Clicar numa miniatura define a saída do node. */
export function Preview({ items, selectedId, onSelect, empty, aspect }: { items: MediaRef[]; selectedId?: string; onSelect: (m: MediaRef) => void; empty: ReactNode; aspect?: string }) {
  const open = useLightbox((s) => s.open);
  const main = items.find((m) => m.id === selectedId) ?? items[0];
  const ratio = aspect?.replace(":", " / ") ?? "4 / 3";
  if (!main) return <div className="preview is-empty" style={{ aspectRatio: ratio }}>{empty}</div>;
  return (
    <div className="preview" onDoubleClick={() => open(main)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={main.id} className="preview-frame" initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
          <MediaView media={main} />
        </motion.div>
      </AnimatePresence>
      <div className="preview-actions nodrag">
        <button className="icon-btn glass" title="Ampliar" onClick={() => open(main)}><Expand size={13} /></button>
        <button className="icon-btn glass" title="Baixar" onClick={() => downloadMedia(main)}><Download size={13} /></button>
      </div>
      {items.length > 1 && (
        <div className="preview-strip nodrag nowheel">
          {items.slice(0, 12).map((m) => (
            <button key={m.id} className={`thumb ${m.id === main.id ? "is-active" : ""}`} onClick={() => onSelect(m)}>
              <MediaView media={m} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Field({ label, children, aside }: { label: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="field-wrap">
      <span className="field-label">{label}{aside && <span className="field-aside">{aside}</span>}</span>
      {children}
    </div>
  );
}

export function FullModelSelect({ capability, value, onChange }: { capability: Capability; value?: string; onChange: (id: string) => void }) {
  return (
    <Popover className="block" width={300} trigger={() => (
      <span className="select-like">
        <span className="menu-icon"><Sparkles size={13} /></span>
        <span>{modelLabel(value)}</span>
        <ChevronDown size={14} />
      </span>
    )}>
      {(close) => <ModelList capability={capability} value={value} onChange={onChange} close={close} />}
    </Popover>
  );
}
