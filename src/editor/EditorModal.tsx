import { AnimatePresence, motion } from "motion/react";
import { Brush, Check, Copy, Download, Eraser, Hand, Minus, Plus, Eye, EyeOff, FileText, ImagePlus, Lasso, RotateCcw, ScanEye, Square, Undo2, X, Loader2, FlipHorizontal2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useEditor } from "./store";
import { ACTIONS, ENGINES, FAMILIES, engineById, type EditEngine } from "./engines";
import { estimateEdit, previewPrompt, runEdit, type EditOptions, type EditResult, type Placement } from "./pipeline";
import { importFiles } from "../canvas/nodes";
import { downloadMedia, MediaView } from "../canvas/nodes/controls";
import { Timer } from "../canvas/Timer";
import { useActiveSpace, useSpaces } from "../store/spaces";
import { notify } from "../store/toasts";
import { notifyDesktop } from "../lib/system";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MediaRef } from "../lib/media";
import { immersive } from "../lib/motion";

type Tool = "brush" | "erase" | "lasso" | "rect" | "hand";

/** Ajustes lembrados entre aberturas, como a janela do Modify. */
interface EditorPrefs {
  engineId: string;
  category: string;
  action: string;
  instruction: string;
  variations: number;
  tier: string;
  moreContext: boolean;
  maxSide: number;
  placement: Placement;
  objectName: string;
  keepInside: boolean;
  shadow: boolean;
  director: boolean;
  set: (p: Partial<EditorPrefs>) => void;
}

const usePrefs = create<EditorPrefs>()(
  persist(
    (set) => ({
      engineId: "nb2",
      category: "Pessoas",
      action: "Adicionar pessoas",
      instruction: "",
      variations: 1,
      tier: "auto",
      moreContext: true,
      maxSide: 2000,
      placement: "object",
      objectName: "pessoa",
      keepInside: true,
      shadow: true,
      director: true,
      set: (p) => set(p),
    }),
    { name: "bravo-editor-prefs", partialize: ({ set: _s, ...rest }) => rest },
  ),
);

const MASK_COLOR = "#e0866a";
const MAX_REFS = 4;

export function EditorModal() {
  const { target, close } = useEditor();
  return <AnimatePresence>{target && <Editor key={target.media.id} media={target.media} nodeId={target.nodeId} onClose={close} />}</AnimatePresence>;
}

function Editor({ media, nodeId, onClose }: { media: MediaRef; nodeId?: string; onClose: () => void }) {
  const prefs = usePrefs();
  const engine: EditEngine = engineById(prefs.engineId);
  const space = useActiveSpace();
  const { addNode, onConnect, updateNode } = useSpaces();

  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [brush, setBrush] = useState(60);
  const [showMask, setShowMask] = useState(true);
  const [references, setReferences] = useState<MediaRef[]>([]);
  const [results, setResults] = useState<EditResult[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [compare, setCompare] = useState(50);
  const [running, setRunning] = useState<{ started: number; status: string; controller: AbortController } | null>(null);
  const [path, setPath] = useState<{ x: number; y: number }[]>([]);
  const [draft, setDraft] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [dragRect, setDragRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  // Zoom e deslocamento da cena (roda do mouse, barra de cima, espaço + arrastar).
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const stageRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const zoomAt = useCallback((next: number, cx?: number, cy?: number) => {
    setView((v) => {
      const z = Math.min(8, Math.max(1, next));
      if (z === 1) return { z: 1, x: 0, y: 0 };
      const r = frameRef.current?.getBoundingClientRect();
      if (!r) return { ...v, z };
      // Mantém parado o ponto sob o cursor (ou o centro, pelos botões).
      const c0x = r.left + r.width / 2 - v.x, c0y = r.top + r.height / 2 - v.y;
      const px = cx ?? c0x + v.x, py = cy ?? c0y + v.y;
      const ux = (px - c0x - v.x) / v.z, uy = (py - c0y - v.y) / v.z;
      return { z, x: px - c0x - z * ux, y: py - c0y - z * uy };
    });
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(viewRef.current.z * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, size]);
  const viewRef = useRef(view);
  viewRef.current = view;

  const maskRef = useRef<HTMLCanvasElement>(null);
  const history = useRef<ImageData[]>([]);
  const drawing = useRef<{ last: { x: number; y: number } | null }>({ last: null });
  const refInput = useRef<HTMLInputElement>(null);

  // Tamanho real da imagem: a máscara é desenhada nessa resolução.
  useEffect(() => {
    const img = new Image();
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = media.url;
  }, [media.url]);

  const ctx = () => maskRef.current!.getContext("2d", { willReadFrequently: true })!;
  const snapshot = () => {
    const c = maskRef.current;
    if (!c) return;
    history.current = [...history.current.slice(-24), ctx().getImageData(0, 0, c.width, c.height)];
  };
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) ctx().putImageData(prev, 0, 0);
  }, []);

  // Coordenada do ponteiro em pixels da imagem.
  const toImage = (e: RPointerEvent) => {
    const r = maskRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * size!.w, y: ((e.clientY - r.top) / r.height) * size!.h, scale: size!.w / r.width };
  };

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }, scale: number) => {
    const g = ctx();
    g.globalCompositeOperation = tool === "erase" ? "destination-out" : "source-over";
    g.strokeStyle = MASK_COLOR;
    g.fillStyle = MASK_COLOR;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = brush * scale;
    g.beginPath();
    g.moveTo(from.x, from.y);
    g.lineTo(to.x, to.y);
    g.stroke();
  };

  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (spaceHeld || tool === "hand" || e.button === 1) {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      return;
    }
    if (!size || running || e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setPicked(null);
    setShowMask(true);
    snapshot();
    const p = toImage(e);
    if (tool === "brush" || tool === "erase") {
      drawing.current.last = p;
      stroke(p, p, p.scale);
    } else if (tool === "lasso") setPath([p]);
    else setDragRect({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };

  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (pan.current) {
      const p = pan.current;
      setView((v) => ({ ...v, x: p.vx + e.clientX - p.x, y: p.vy + e.clientY - p.y }));
      return;
    }
    if (!size || !(e.buttons & 1)) return;
    const p = toImage(e);
    if ((tool === "brush" || tool === "erase") && drawing.current.last) {
      stroke(drawing.current.last, p, p.scale);
      drawing.current.last = p;
    } else if (tool === "lasso" && path.length) setPath((pts) => [...pts, p]);
    else if (tool === "rect" && dragRect) setDragRect({ ...dragRect, x1: p.x, y1: p.y });
  };

  const onUp = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (pan.current) {
      pan.current = null;
      return;
    }
    drawing.current.last = null;
    const g = ctx();
    // Alt subtrai, como no Photoshop.
    g.globalCompositeOperation = e.altKey ? "destination-out" : "source-over";
    g.fillStyle = MASK_COLOR;
    if (tool === "lasso" && path.length > 2) {
      g.beginPath();
      path.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.fill();
    } else if (tool === "rect" && dragRect) {
      g.fillRect(Math.min(dragRect.x0, dragRect.x1), Math.min(dragRect.y0, dragRect.y1), Math.abs(dragRect.x1 - dragRect.x0), Math.abs(dragRect.y1 - dragRect.y0));
    }
    setPath([]);
    setDragRect(null);
  };

  const clearMask = () => {
    snapshot();
    ctx().clearRect(0, 0, size!.w, size!.h);
  };
  const invertMask = () => {
    snapshot();
    const c = maskRef.current!;
    const g = ctx();
    const tmp = document.createElement("canvas");
    tmp.width = c.width;
    tmp.height = c.height;
    const tg = tmp.getContext("2d")!;
    tg.fillStyle = MASK_COLOR;
    tg.fillRect(0, 0, c.width, c.height);
    tg.globalCompositeOperation = "destination-out";
    tg.drawImage(c, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = "source-over";
    g.drawImage(tmp, 0, 0);
  };

  // Atalhos: B/E/L/M como no Photoshop, Ctrl+Z, colchetes para o pincel, Ctrl+V cola exemplo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName);
      if (e.key === "Escape" && !running) onClose();
      if (typing) return;
      if (e.code === "Space") { e.preventDefault(); if (!e.repeat) setSpaceHeld(true); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      else if (e.key === "+" || e.key === "=") zoomAt(view.z * 1.25);
      else if (e.key === "-") zoomAt(view.z / 1.25);
      else if (e.key === "0") zoomAt(1);
      else if (e.key === "h") setTool("hand");
      else if (e.key === "b") setTool("brush");
      else if (e.key === "e") setTool("erase");
      else if (e.key === "l") setTool("lasso");
      else if (e.key === "m") setTool("rect");
      else if (e.key === "[") setBrush((b) => Math.max(4, Math.round(b * 0.8)));
      else if (e.key === "]") setBrush((b) => Math.min(600, Math.round(b * 1.25)));
    };
    const onPaste = async (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      addReferences(files);
    };
    const onKeyUp = (e: KeyboardEvent) => e.code === "Space" && setSpaceHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("paste", onPaste, true);
    return () => {
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste, true);
    };
  });

  async function addReferences(files: File[]) {
    const added = await importFiles(files);
    setReferences((r) => [...r, ...added].slice(0, MAX_REFS));
  }

  const estimate = useMemo(
    () =>
      estimateEdit({
        engine,
        variations: prefs.variations,
        tier: prefs.tier === "auto" ? undefined : prefs.tier,
        placement: prefs.placement,
        director: prefs.director && !draft,
        category: prefs.category,
        action: prefs.action,
      }),
    [engine, prefs.variations, prefs.tier, prefs.placement, prefs.director, prefs.category, prefs.action, draft],
  );

  const options = (): EditOptions => ({
    image: media,
    mask: maskRef.current!,
    engine,
    category: prefs.category,
    action: prefs.action,
    instruction: prefs.instruction,
    references: engine.references ? references : [],
    variations: prefs.variations,
    tier: prefs.tier === "auto" ? undefined : prefs.tier,
    moreContext: prefs.moreContext,
    maxSide: prefs.maxSide,
    placement: prefs.placement,
    objectName: prefs.objectName,
    keepInside: prefs.keepInside,
    shadow: prefs.shadow,
    director: prefs.director,
    promptOverride: draft ?? undefined,
  });

  /** Roda só o diretor e mostra o pedido para revisar antes de gerar. */
  async function review() {
    if (!maskRef.current || drafting || running) return;
    setDrafting(true);
    try {
      const { prompt, directed } = await previewPrompt({ ...options(), promptOverride: undefined }, {});
      setDraft(prompt);
      if (prefs.director && !directed) notify("O diretor não respondeu (confira a chave do Google em Ajustes). Mostrando o pedido padrão.", "error");
    } catch (e) {
      notify(`Editor: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setDrafting(false);
    }
  }

  async function generate() {
    if (!maskRef.current || running) return;
    const controller = new AbortController();
    setRunning({ started: Date.now(), status: "Preparando…", controller });
    try {
      const out = await runEdit(
        options(),
        {
          signal: controller.signal,
          onStatus: (status) => setRunning((r) => (r ? { ...r, status } : r)),
          onResult: (r) => {
            setResults((all) => [r, ...all]);
            setPicked(r.media.id);
            // Mostra o resultado inteiro; o usuário arrasta para comparar.
            setCompare(0);
            setShowMask(false);
          },
        },
      );
      notifyDesktop("Bravo Hub", `Edição pronta: ${out.length} variação(ões).`);
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      if (!aborted) notify(`Editor: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setRunning(null);
    }
  }

  /** Leva a variação escolhida para o fluxo: num node Editor, ligado à origem. */
  function apply() {
    const chosen = results.find((r) => r.media.id === picked);
    if (!chosen || !space) return;
    const all = results.map((r) => r.media);
    const source = nodeId ? space.nodes.find((n) => n.id === nodeId) : undefined;
    if (source?.type === "edit") {
      updateNode(source.id, { gallery: [...all, ...(source.data.gallery ?? [])], outputs: { images: [chosen.media] } });
    } else {
      const pos = source ? { x: source.position.x + 440, y: source.position.y } : { x: 0, y: 0 };
      const id = addNode("edit", pos, { gallery: all, outputs: { images: [chosen.media] }, prompt: prefs.instruction });
      if (source) onConnect({ source: source.id, sourceHandle: "out-image", target: id, targetHandle: "in-image" });
    }
    notify("Edição aplicada no fluxo.", "ok");
    onClose();
  }

  const actions = ACTIONS[prefs.category] ?? [];
  const pickedResult = results.find((r) => r.media.id === picked);

  return (
    <motion.div className="editor" {...immersive}>
      <header className="editor-bar">
        <span className="editor-title">Editor</span>
        <div className="editor-tools">
          {([["brush", Brush, "Pincel (B)"], ["erase", Eraser, "Borracha (E)"], ["lasso", Lasso, "Laço (L) · Alt subtrai"], ["rect", Square, "Retângulo (M) · Alt subtrai"], ["hand", Hand, "Mover a cena (H, ou segure Espaço)"]] as const).map(([id, Icon, title]) => (
            <button key={id} className={`tool-btn ${tool === id ? "is-active" : ""}`} title={title} onClick={() => setTool(id)}><Icon size={16} /></button>
          ))}
          <span className="tool-sep v" />
          <label className="slider" title="Tamanho do pincel ([ e ])">
            <span>Pincel</span>
            <input type="range" min={4} max={600} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
            <b>{brush}</b>
          </label>
          <span className="tool-sep v" />
          <button className="tool-btn" title="Desfazer (Ctrl+Z)" onClick={undo}><Undo2 size={16} /></button>
          <button className="tool-btn" title="Inverter seleção" onClick={invertMask}><FlipHorizontal2 size={16} /></button>
          <button className="tool-btn" title="Limpar seleção" onClick={clearMask}><RotateCcw size={16} /></button>
          <button className={`tool-btn ${showMask ? "is-active" : ""}`} title="Mostrar seleção" onClick={() => setShowMask((s) => !s)}>{showMask ? <Eye size={16} /> : <EyeOff size={16} />}</button>
          <span className="tool-sep v" />
          <div className="ed-zoom">
            <button className="tool-btn" title="Afastar (-)" onClick={() => zoomAt(view.z / 1.25)} disabled={view.z <= 1}><Minus size={15} /></button>
            <button className="ed-zoom-pct" title="Ajustar à tela (0)" onClick={() => zoomAt(1)}>{Math.round(view.z * 100)}%</button>
            <button className="tool-btn" title="Aproximar (+) · ou role o mouse" onClick={() => zoomAt(view.z * 1.25)} disabled={view.z >= 8}><Plus size={15} /></button>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} title="Fechar (Esc)"><X size={18} /></button>
      </header>

      <div className="editor-body">
        <section className={`editor-stage ${spaceHeld || tool === "hand" ? "is-panning" : ""}`} ref={stageRef}>
          {size && (
            <div
              ref={frameRef}
              className="editor-frame"
              style={{
                aspectRatio: `${size.w} / ${size.h}`,
                width: `min(100%, calc((100vh - 210px) * ${size.w / size.h}))`,
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
                transition: pan.current ? "none" : "transform 120ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <img src={media.url} alt="" draggable={false} />
              {pickedResult && (
                <div className="editor-after" style={{ clipPath: `inset(0 0 0 ${compare}%)` }}>
                  <MediaView media={pickedResult.media} />
                </div>
              )}
              <canvas
                ref={maskRef}
                width={size.w}
                height={size.h}
                className={`editor-mask tool-${tool} ${showMask ? "" : "is-hidden"}`}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
              />
              <svg className="editor-guides" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none">
                {path.length > 1 && <polyline points={path.map((p) => `${p.x},${p.y}`).join(" ")} />}
                {dragRect && <rect x={Math.min(dragRect.x0, dragRect.x1)} y={Math.min(dragRect.y0, dragRect.y1)} width={Math.abs(dragRect.x1 - dragRect.x0)} height={Math.abs(dragRect.y1 - dragRect.y0)} />}
              </svg>
              {pickedResult && (
                <input className="compare-range" type="range" min={0} max={100} value={compare} onChange={(e) => setCompare(Number(e.target.value))} title="Antes e depois" />
              )}
              {pickedResult && <span className="compare-line" style={{ left: `${compare}%` }} />}
              <AnimatePresence>
                {running && (
                  <motion.div className="editor-busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <i className="scanline" />
                    <Timer since={running.started} />
                    <span>{running.status}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {results.length > 0 && (
            <div className="editor-results">
              <button className={`thumb ${picked === null ? "is-active" : ""}`} onClick={() => { setPicked(null); setShowMask(true); }} title="Original">
                <MediaView media={media} />
              </button>
              {results.map((r) => (
                <motion.button key={r.media.id} className={`thumb develop ${picked === r.media.id ? "is-active" : ""}`} onClick={() => { setPicked(r.media.id); setShowMask(false); setCompare(0); }} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                  <MediaView media={r.media} />
                </motion.button>
              ))}
              {pickedResult && (
                <div className="result-tools">
                  {pickedResult.cutout && (
                    <button className="tool-btn" title="Baixar só o recorte (PNG transparente)" onClick={() => downloadMedia(pickedResult.cutout!)}><Download size={16} /></button>
                  )}
                  <button className={`tool-btn ${showPrompt ? "is-active" : ""}`} title="Ver o pedido enviado" onClick={() => setShowPrompt((v) => !v)}><FileText size={16} /></button>
                </div>
              )}
              {pickedResult && space && (
                <button className="btn btn-primary apply-btn" onClick={apply}><Check size={15} /> Aplicar no fluxo</button>
              )}
            </div>
          )}
          <AnimatePresence>
            {pickedResult && (showPrompt || pickedResult.note || pickedResult.timings) && (
              <motion.div className="result-info" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22 }}>
                {pickedResult.note && <p className="result-note">{pickedResult.note}</p>}
                {pickedResult.timings && (
                  <p className="result-times">
                    {pickedResult.timings.filter(([, s]) => s >= 0.1).map(([l, s]) => `${l} ${s < 10 ? s.toFixed(1) : Math.round(s)}s`).join("  ·  ")}
                  </p>
                )}
                {showPrompt && (
                  <>
                    <div className="result-info-head">
                      <span className="eyebrow">Pedido enviado</span>
                      <button className="icon-btn" title="Copiar" onClick={() => { navigator.clipboard.writeText(pickedResult.prompt); notify("Pedido copiado.", "ok"); }}><Copy size={14} /></button>
                    </div>
                    <pre>{pickedResult.prompt}</pre>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <motion.aside className="editor-panel" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } } }}>
          <Section n="01" title="Inteligência">
            <Segmented
              id="family"
              options={FAMILIES.map((f) => ({ value: f, label: f.split(" (")[0] }))}
              value={engine.family}
              onChange={(f) => prefs.set({ engineId: ENGINES.find((x) => x.family === f)!.id, tier: "auto" })}
            />
            <div className="ep-chips">
              {ENGINES.filter((x) => x.family === engine.family).map((x) => (
                <button key={x.id} className={`ep-chip ${x.id === engine.id ? "is-active" : ""}`} onClick={() => prefs.set({ engineId: x.id, tier: "auto" })}>
                  {x.name.replace(/^(Nano Banana|Seedream|GPT Image|Flux) ?/, "") || x.name}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.p key={engine.id} className="ep-hint" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {engine.hint}
              </motion.p>
            </AnimatePresence>
          </Section>

          <Section n="02" title="O que fazer">
            <Segmented
              id="category"
              options={Object.keys(ACTIONS).map((c) => ({ value: c, label: c === "Prompt livre" ? "Livre" : c }))}
              value={prefs.category}
              onChange={(c) => { prefs.set({ category: c, action: ACTIONS[c]?.[0]?.[0] ?? "" }); setDraft(null); }}
            />
            {actions.length > 0 && (
              <div className="ep-chips">
                {actions.map(([name]) => (
                  <button key={name} className={`ep-chip ${prefs.action === name ? "is-active" : ""}`} onClick={() => { prefs.set({ action: name }); setDraft(null); }}>{name}</button>
                ))}
              </div>
            )}
            <textarea className="ep-input" rows={3} placeholder="Descreva com as suas palavras… ex.: mulher de costas abrindo as cortinas" value={prefs.instruction} onChange={(e) => { prefs.set({ instruction: e.target.value }); setDraft(null); }} />
            <div className="ep-director">
              <Switch checked={prefs.director} onChange={(director) => { prefs.set({ director }); setDraft(null); }} label="Diretor de prompt" hint="Lê a luz, a câmera e a escala da cena e escreve o pedido" />
              <button className="ep-ghost" onClick={review} disabled={drafting}>
                {drafting ? <Loader2 size={13} className="spin" /> : <ScanEye size={13} />} {draft ? "Refazer" : "Ver antes"}
              </button>
            </div>
            <AnimatePresence initial={false}>
              {draft !== null && (
                <motion.div key="draft" className="ep-draft" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}>
                  <div className="ep-draft-head">
                    <span className="eyebrow">Pedido revisado · vai assim</span>
                    <button className="icon-btn" title="Descartar e deixar o diretor escrever na hora" onClick={() => setDraft(null)}><X size={13} /></button>
                  </div>
                  <textarea className="ep-input mono" rows={9} value={draft} onChange={(e) => setDraft(e.target.value)} />
                </motion.div>
              )}
            </AnimatePresence>
            {engine.references ? (
              <div className="ep-refs">
                <AnimatePresence>
                  {references.map((r) => (
                    <motion.button key={r.id} className="ref-slot filled" title="Remover exemplo" onClick={() => setReferences((all) => all.filter((x) => x.id !== r.id))} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                      <MediaView media={r} />
                      <span className="ref-x"><X size={12} /></span>
                    </motion.button>
                  ))}
                </AnimatePresence>
                {references.length < MAX_REFS && (
                  <button className="ref-slot" onClick={() => refInput.current?.click()} title="Escolher exemplo (ou Ctrl+V)">
                    <ImagePlus size={15} />
                    <span>Exemplo</span>
                  </button>
                )}
                <input ref={refInput} type="file" hidden multiple accept="image/png,image/jpeg,image/webp" onChange={(e) => addReferences(Array.from(e.target.files ?? []))} />
              </div>
            ) : (
              <p className="ep-hint">Este motor não aceita imagem de exemplo.</p>
            )}
          </Section>

          <Section n="03" title="Qualidade">
            {engine.tier && (
              <div className="ep-line">
                <span>{engine.tier.label}</span>
                <div className="ep-chips tight">
                  {["auto", ...engine.tier.values].map((v) => (
                    <button key={v} className={`ep-chip ${prefs.tier === v ? "is-active" : ""}`} onClick={() => prefs.set({ tier: v })}>{v === "auto" ? "Auto" : v}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="ep-line">
              <span>Variações</span>
              <div className="ep-chips tight">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} className={`ep-chip ${prefs.variations === n ? "is-active" : ""}`} onClick={() => prefs.set({ variations: n })}>{n}</button>
                ))}
              </div>
            </div>
            <Switch checked={prefs.moreContext} onChange={(moreContext) => prefs.set({ moreContext })} label="Mostrar mais da cena à IA" hint="Acerta escala e luz" />
          </Section>

          <Section n="04" title="Como entra na imagem">
            <div className="ep-cards">
              {([
                ["object", "Recorte exato", "Contorno do que você nomear"],
                ["changed", "Só o que mudou", "Compara com o original"],
                ["shape", "Contorno da seleção", "Usa a área inteira pintada"],
              ] as const).map(([v, t, d]) => (
                <button key={v} className={`ep-card ${prefs.placement === v ? "is-active" : ""}`} onClick={() => prefs.set({ placement: v })}>
                  {prefs.placement === v && <motion.span layoutId="ep-card-glow" className="ep-card-glow" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  <b>{t}</b>
                  <small>{d}</small>
                </button>
              ))}
            </div>
            <AnimatePresence initial={false}>
              {prefs.placement === "object" && (
                <motion.input key="obj" className="ep-input single" placeholder="O quê? ex.: mulher, carro, árvore" value={prefs.objectName} onChange={(e) => prefs.set({ objectName: e.target.value })} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 40 }} exit={{ opacity: 0, height: 0 }} />
              )}
            </AnimatePresence>
            {prefs.placement === "object" && <Switch checked={prefs.shadow} onChange={(shadow) => prefs.set({ shadow })} label="Levar a sombra junto" hint="Sombra de contato e projetada" />}
            {prefs.placement !== "shape" && <Switch checked={prefs.keepInside} onChange={(keepInside) => prefs.set({ keepInside })} label="Não deixar sair da seleção" />}
          </Section>

          <footer className="ep-foot">
            <div className="ep-cost">
              <span className="field-label">Estimativa</span>
              <span>US$ {estimate.toFixed(3)}</span>
            </div>
            {running ? (
              <button className="btn btn-block" onClick={() => running.controller.abort()}><Loader2 size={14} className="spin" /> Cancelar</button>
            ) : (
              <button className="btn btn-primary btn-block" onClick={generate}>Gerar</button>
            )}
          </footer>
        </motion.aside>
      </div>
    </motion.div>
  );
}

const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] as const } } };

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <motion.section className="ep-section" variants={item}>
      <span className="eyebrow">{n}. {title}</span>
      {children}
    </motion.section>
  );
}

/** Abas com indicador que desliza até a escolhida. */
function Segmented({ id, options, value, onChange }: { id: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? "is-active" : ""} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.span layoutId={`seg-${id}`} className="seg-pill" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button className={`switch-row ${checked ? "is-on" : ""}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span className="switch"><motion.span className="knob" layout transition={{ type: "spring", stiffness: 600, damping: 35 }} /></span>
      <span className="switch-text">{label}{hint && <small>{hint}</small>}</span>
    </button>
  );
}
