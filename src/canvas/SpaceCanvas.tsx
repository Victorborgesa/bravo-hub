import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Copy, Hand, Map as MapIcon, Maximize, Minus, MousePointer2, Play, Plus, Redo2, Trash2, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { nodeTypes, importFiles } from "./nodes";
import { edgeTypes } from "./edges";
import { MediaView, downloadMedia, useInspector, useLightbox } from "./nodes/controls";
import { handleType, type NodeKind } from "./ports";
import { runSelection, runSpace } from "./engine";
import { Palette, type PaletteChoice } from "./Palette";
import { Inspector } from "./Inspector";
import { RunPanel } from "./RunPanel";
import { useActiveSpace, useSpaces } from "../store/spaces";
import { useCosts } from "../store/costs";
import { formatUsd } from "../lib/format";
import { notify } from "../store/toasts";

type Tool = "select" | "hand";

function isValidConnection(c: Connection | Edge) {
  if (c.source === c.target) return false;
  const from = handleType(c.sourceHandle);
  return !!from && from === handleType(c.targetHandle);
}

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
};

export function Lightbox() {
  const { media, open } = useLightbox();
  return (
    <AnimatePresence>
      {media && (
        <motion.div className="lightbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => open(null)}>
          <motion.div className="lightbox-inner" initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} onClick={(e) => e.stopPropagation()}>
            <MediaView media={media} controls />
            <div className="lightbox-meta">
              <div>
                <span className="eyebrow">{media.model ?? "Upload"}</span>
                {media.prompt && <p>{media.prompt}</p>}
              </div>
              <div className="lightbox-actions">
                <button className="btn" onClick={() => downloadMedia(media)}>Baixar</button>
                <button className="icon-btn" onClick={() => open(null)}><X size={18} /></button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SideTools({ tool, setTool, onAdd }: { tool: Tool; setTool: (t: Tool) => void; onAdd: () => void }) {
  const { undo, redo, past, future } = useSpaces();
  const { fitView } = useReactFlow();
  const btn = (active: boolean) => `tool-btn ${active ? "is-active" : ""}`;
  return (
    <motion.nav className="side-tools" initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
      <button className="tool-btn add" title="Adicionar node (N)" onClick={onAdd}><Plus size={18} /></button>
      <span className="tool-sep" />
      <button className={btn(tool === "select")} title="Selecionar (V) · arraste para selecionar vários" onClick={() => setTool("select")}><MousePointer2 size={16} /></button>
      <button className={btn(tool === "hand")} title="Mover a tela (H) · ou segure Espaço" onClick={() => setTool("hand")}><Hand size={16} /></button>
      <span className="tool-sep" />
      <button className="tool-btn" title="Desfazer (Ctrl+Z)" disabled={!past.length} onClick={undo}><Undo2 size={16} /></button>
      <button className="tool-btn" title="Refazer (Ctrl+Shift+Z)" disabled={!future.length} onClick={redo}><Redo2 size={16} /></button>
      <span className="tool-sep" />
      <button className="tool-btn" title="Enquadrar tudo (Shift+1)" onClick={() => fitView({ padding: 0.2, duration: 500 })}><Maximize size={16} /></button>
    </motion.nav>
  );
}

function ZoomControl({ showMap, toggleMap }: { showMap: boolean; toggleMap: () => void }) {
  const zoom = useStore((s) => s.transform[2]);
  const { zoomIn, zoomOut, zoomTo } = useReactFlow();
  return (
    <motion.div className="zoom-ctl" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.5 }}>
      <button className={`tool-btn small ${showMap ? "is-active" : ""}`} title="Minimapa" onClick={toggleMap}><MapIcon size={15} /></button>
      <span className="tool-sep v" />
      <button className="tool-btn small" onClick={() => zoomOut({ duration: 200 })}><Minus size={14} /></button>
      <button className="zoom-value" title="Voltar a 100%" onClick={() => zoomTo(1, { duration: 300 })}>{Math.round(zoom * 100)}%</button>
      <button className="tool-btn small" onClick={() => zoomIn({ duration: 200 })}><Plus size={14} /></button>
    </motion.div>
  );
}

function SelectionBar() {
  const selected = useStore((s) => s.nodes.filter((n) => n.selected).map((n) => n.id));
  const { removeNodes, duplicateNodes, activeId } = useSpaces();
  return (
    <AnimatePresence>
      {selected.length > 1 && (
        <motion.div className="selection-bar" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
          <span className="sel-count">{selected.length} selecionados</span>
          <button className="tb-btn wide" onClick={() => activeId && runSelection(activeId, selected)}><Play size={13} /> Executar</button>
          <button className="tb-btn wide" onClick={() => duplicateNodes(selected)}><Copy size={13} /> Duplicar</button>
          <button className="tb-btn wide danger" onClick={() => removeNodes(selected)}><Trash2 size={13} /> Excluir</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Canvas() {
  const space = useActiveSpace();
  const store = useSpaces();
  const { onNodesChange, onEdgesChange, onConnect, open, rename, addNode, duplicateNodes, undo, redo } = store;
  const { screenToFlowPosition, fitView } = useReactFlow();
  const entries = useCosts((s) => s.entries);
  const openInspector = useInspector((s) => s.open);
  const [tool, setTool] = useState<Tool>("select");
  const [palette, setPalette] = useState<{ x: number; y: number; flow: { x: number; y: number } } | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<{ x: number; y: number } | null>(null);
  // Conexões antigas não tinham tipo; todas usam a curva colorida.
  const edges = useMemo(() => (space?.edges ?? []).map((e) => (e.type ? e : { ...e, type: "typed" })), [space?.edges]);
  const spent = useMemo(() => entries.filter((e) => e.spaceId === space?.id).reduce((a, e) => a + e.usd, 0), [entries, space?.id]);

  const openPaletteAt = useCallback(
    (x: number, y: number) => setPalette({ x, y, flow: screenToFlowPosition({ x, y }) }),
    [screenToFlowPosition],
  );

  const centerFlow = () => screenToFlowPosition({ x: window.innerWidth / 2 - 160, y: window.innerHeight / 2 - 180 });

  const choose = (c: PaletteChoice, at: { x: number; y: number }) => {
    if (c.pickFiles) {
      pendingUpload.current = at;
      fileInput.current?.click();
      return;
    }
    addNode(c.kind as NodeKind, at);
  };

  async function placeImages(files: File[], at: { x: number; y: number }) {
    // Uma imagem por node, lado a lado, para cada uma poder ir para um lugar diferente do fluxo.
    const media = await importFiles(files);
    media.forEach((m, i) => addNode("upload", { x: at.x + (i % 4) * 330, y: at.y + Math.floor(i / 4) * 360 }, { gallery: [m], outputs: { images: [m] } }));
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) placeImages(files, screenToFlowPosition({ x: e.clientX - 150, y: e.clientY - 120 }));
  };

  // Atalhos de teclado do canvas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      const selected = useSpaces.getState().spaces.find((s) => s.id === useSpaces.getState().activeId)?.nodes.filter((n) => n.selected).map((n) => n.id) ?? [];
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateNodes(selected); }
      else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const nodes = useSpaces.getState().spaces.find((s) => s.id === useSpaces.getState().activeId)?.nodes ?? [];
        onNodesChange(nodes.map((n) => ({ type: "select", id: n.id, selected: true })));
      }
      else if (mod) return;
      else if (e.key === "v" || e.key === "V") setTool("select");
      else if (e.key === "h" || e.key === "H") setTool("hand");
      else if (e.key === "n" || e.key === "N" || e.key === "/") { e.preventDefault(); openPaletteAt(window.innerWidth / 2 - 160, window.innerHeight / 3); }
      else if (e.key === "!" || (e.shiftKey && e.code === "Digit1")) fitView({ padding: 0.2, duration: 500 });
      else if (e.key === "Escape") { setPalette(null); openInspector(null); }
    };
    // Colar uma imagem (Ctrl+V) cria um node de upload no meio da tela.
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e as unknown as KeyboardEvent)) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        placeImages(files, centerFlow());
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  });

  if (!space) return null;

  return (
    <motion.div className={`canvas tool-${tool}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={onDrop}
    >
      <motion.header className="canvas-bar" initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        <button className="icon-btn" onClick={() => open(null)} title="Voltar aos spaces">
          <ArrowLeft size={18} />
        </button>
        <span className="crumb">Spaces</span>
        <span className="crumb-sep">/</span>
        <input className="space-name" value={space.name} onChange={(e) => rename(space.id, e.target.value)} />
        <div className="canvas-bar-right">
          <span className="spent" title="Custo estimado deste space">{formatUsd(spent)}</span>
          <button className="btn btn-primary" onClick={() => runSpace(space.id)}>
            <Play size={14} /> Executar fluxo
          </button>
        </div>
      </motion.header>

      <ReactFlow
        nodes={space.nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        defaultEdgeOptions={{ type: "typed" }}
        onPaneContextMenu={(e) => { e.preventDefault(); openPaletteAt(e.clientX, e.clientY); }}
        onNodeDoubleClick={(_, n) => ["image", "video", "assistant", "upscale"].includes(n.type!) && openInspector(n.id)}
        onPaneClick={() => { setPalette(null); }}
        selectionOnDrag={tool === "select"}
        selectionMode={SelectionMode.Partial}
        panOnDrag={tool === "hand" ? true : [1, 2]}
        panActivationKeyCode="Space"
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
        deleteKeyCode={["Delete", "Backspace"]}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--bg-grid)" />
        {showMap && <MiniMap pannable zoomable nodeColor="var(--surface-3)" position="bottom-right" style={{ bottom: 56 }} />}
      </ReactFlow>

      <SideTools tool={tool} setTool={setTool} onAdd={() => openPaletteAt(84, 120)} />
      <ZoomControl showMap={showMap} toggleMap={() => setShowMap((m) => !m)} />
      <SelectionBar />
      <RunPanel />
      <Inspector />

      <AnimatePresence>
        {palette && (
          <Palette x={palette.x} y={palette.y} onClose={() => setPalette(null)} onPick={(c) => choose(c, palette.flow)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dragOver && (
          <motion.div className="drop-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span>Solte as imagens para adicionar ao space</span>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) placeImages(files, pendingUpload.current ?? centerFlow());
          else notify("Nenhuma imagem escolhida.");
        }}
      />
    </motion.div>
  );
}

export function SpaceCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
