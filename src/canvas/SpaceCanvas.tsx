import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Play, X } from "lucide-react";
import { useMemo } from "react";
import { nodeTypes } from "./nodes";
import { NodeIcon } from "./nodes/icons";
import { MediaView, downloadMedia, useLightbox } from "./nodes/controls";
import { handleType, NODE_SPECS, type NodeKind } from "./ports";
import { runSpace } from "./engine";
import { useActiveSpace, useSpaces } from "../store/spaces";
import { useCosts } from "../store/costs";
import { formatUsd } from "../lib/format";

const DOCK: NodeKind[] = ["text", "list", "assistant", "upload", "image", "video", "upscale"];

function isValidConnection(c: Connection | Edge) {
  if (c.source === c.target) return false;
  const from = handleType(c.sourceHandle);
  return !!from && from === handleType(c.targetHandle);
}

function Dock() {
  const addNode = useSpaces((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();
  const add = (kind: NodeKind) => {
    const jitter = () => (Math.random() - 0.5) * 120;
    const pos = screenToFlowPosition({ x: window.innerWidth / 2 + jitter(), y: window.innerHeight / 2 - 120 + jitter() });
    addNode(kind, pos);
  };
  return (
    <motion.nav className="dock" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
      {DOCK.map((kind) => (
        <button key={kind} className="dock-item" onClick={() => add(kind)}>
          <NodeIcon kind={kind} size={18} />
          <span>{NODE_SPECS[kind].title}</span>
        </button>
      ))}
    </motion.nav>
  );
}

export function Lightbox() {
  const { media, open } = useLightbox();
  return (
    <AnimatePresence>
      {media && (
        <motion.div className="lightbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => open(null)}>
          <motion.div className="lightbox-inner" initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }} onClick={(e) => e.stopPropagation()}>
            {media.kind === "video" ? <video src={media.url} controls autoPlay loop /> : <MediaView media={media} />}
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

function Canvas() {
  const space = useActiveSpace();
  const { onNodesChange, onEdgesChange, onConnect, open, rename } = useSpaces();
  const entries = useCosts((s) => s.entries);
  const spent = useMemo(() => entries.filter((e) => e.spaceId === space?.id).reduce((a, e) => a + e.usd, 0), [entries, space?.id]);
  if (!space) return null;

  return (
    <div className="canvas">
      <header className="canvas-bar">
        <button className="icon-btn" onClick={() => open(null)} title="Voltar aos spaces">
          <ArrowLeft size={18} />
        </button>
        <input className="space-name" value={space.name} onChange={(e) => rename(space.id, e.target.value)} />
        <div className="canvas-bar-right">
          <span className="spent" title="Custo estimado deste space">{formatUsd(spent)}</span>
          <button className="btn btn-primary" onClick={() => runSpace(space.id)}>
            <Play size={14} /> Executar fluxo
          </button>
        </div>
      </header>
      <ReactFlow
        nodes={space.nodes}
        edges={space.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        defaultEdgeOptions={{ animated: true }}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.15}
        deleteKeyCode={["Delete", "Backspace"]}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--bg-grid)" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="var(--surface-3)" maskColor="rgba(20,21,18,0.7)" />
      </ReactFlow>
      <Dock />
    </div>
  );
}

export function SpaceCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
