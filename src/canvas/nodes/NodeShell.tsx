import { Handle, NodeToolbar, Position, useEdges, useStore } from "@xyflow/react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, ChevronDown, Copy, Download, Expand, Play, Settings2, Square, Trash2, RotateCcw, Type, Image as ImageIcon, Clapperboard } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cancelNode, runFrom, runNode, runUpTo } from "../engine";
import { handleId, NODE_SPECS, type BaseNodeData, type NodeKind, type PortType } from "../ports";
import { useSpaces } from "../../store/spaces";
import { NodeIcon } from "./icons";
import { Timer } from "../Timer";
import { downloadMedia, useInspector, useLightbox } from "./controls";
import { EASE, float, SPRING_SNAPPY } from "../../lib/motion";

const PORT_ICON: Record<PortType, typeof Type> = { text: Type, image: ImageIcon, video: Clapperboard };
const LABEL_H = 28;

interface Props {
  id: string;
  kind: NodeKind;
  data: BaseNodeData;
  selected?: boolean;
  children: ReactNode;
  width?: number;
}

function Port({ nodeId, dir, type, label, index }: { nodeId: string; dir: "in" | "out"; type: PortType; label: string; index: number }) {
  const edges = useEdges();
  const hid = handleId(dir, type);
  const connected = edges.some((e) => (dir === "in" ? e.target === nodeId && e.targetHandle === hid : e.source === nodeId && e.sourceHandle === hid));
  const Icon = PORT_ICON[type];
  return (
    <Handle
      type={dir === "in" ? "target" : "source"}
      position={dir === "in" ? Position.Left : Position.Right}
      id={hid}
      className={`port port-${type} ${connected ? "is-connected" : ""}`}
      style={{ top: LABEL_H + 26 + index * 40 }}
      title={label}
    >
      <Icon size={13} strokeWidth={1.8} />
      <span className="port-tip">{label}</span>
    </Handle>
  );
}

function Toolbar({ id, kind, data }: { id: string; kind: NodeKind; data: BaseNodeData }) {
  const spec = NODE_SPECS[kind];
  const spaceId = useSpaces((s) => s.activeId)!;
  const { removeNodes, duplicateNodes } = useSpaces();
  const openInspector = useInspector((s) => s.open);
  const openLightbox = useLightbox((s) => s.open);
  const [menu, setMenu] = useState(false);
  const running = data.status === "running";
  const media = data.outputs?.images?.[0] ?? data.outputs?.videos?.[0] ?? data.gallery?.[0];

  return (
    <motion.div className="node-toolbar" initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING_SNAPPY}>
      {spec.runnable && (
        <>
          {running ? (
            <button className="tb-btn" title="Parar" onClick={() => cancelNode(id)}><Square size={13} /></button>
          ) : (
            <button className="tb-btn" title="Executar este node" onClick={() => runNode(id)}><Play size={14} /></button>
          )}
          <div className="tb-menu-anchor">
            <button className={`tb-btn narrow ${menu ? "is-open" : ""}`} title="Mais opções de execução" onClick={() => setMenu((m) => !m)}><ChevronDown size={13} /></button>
            <AnimatePresence>
              {menu && (
                <motion.div className="tb-menu" {...float} onMouseLeave={() => setMenu(false)}>
                  <button onClick={() => { setMenu(false); runNode(id); }}>Executar só este node</button>
                  <button onClick={() => { setMenu(false); runUpTo(spaceId, id); }}>Executar até aqui</button>
                  <button onClick={() => { setMenu(false); runFrom(spaceId, id); }}>Executar daqui em diante</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <span className="tb-sep" />
        </>
      )}
      {spec.runnable && <button className="tb-btn" title="Configurações" onClick={() => openInspector(id)}><Settings2 size={14} /></button>}
      {media && <button className="tb-btn" title="Ampliar" onClick={() => openLightbox(media)}><Expand size={14} /></button>}
      {media && <button className="tb-btn" title="Baixar" onClick={() => downloadMedia(media)}><Download size={14} /></button>}
      <button className="tb-btn" title="Duplicar (Ctrl+D)" onClick={() => duplicateNodes([id])}><Copy size={14} /></button>
      <button className="tb-btn danger" title="Excluir (Delete)" onClick={() => removeNodes([id])}><Trash2 size={14} /></button>
    </motion.div>
  );
}

export function NodeShell({ id, kind, data, selected, children, width = 320 }: Props) {
  const spec = NODE_SPECS[kind];
  const running = data.status === "running";
  // A barra de ações aparece só quando um único node está selecionado.
  const single = useStore((s) => s.nodes.filter((n) => n.selected).length === 1);

  return (
    <motion.div
      className={`node node-${kind} ${selected ? "is-selected" : ""} ${running ? "is-running" : ""} ${data.status === "error" ? "is-error" : ""}`}
      style={{ width }}
      initial={{ opacity: 0, y: 10, scale: 0.95, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <NodeToolbar isVisible={selected && single} position={Position.Top} offset={10}>
        <Toolbar id={id} kind={kind} data={data} />
      </NodeToolbar>

      <div className="node-label">
        <NodeIcon kind={kind} size={13} />
        <span>{spec.title} #{data.seq ?? 1}</span>
        <AnimatePresence>
          {data.status === "done" && <motion.span className="node-dot ok" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={SPRING_SNAPPY} />}
          {data.status === "error" && <motion.span className="node-dot err" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={SPRING_SNAPPY} />}
        </AnimatePresence>
      </div>

      <div className="node-card">
        {children}
        <AnimatePresence>
          {running && (
            <motion.div className="node-busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <i className="scanline" />
              <Timer since={data.startedAt} />
              <span>{data.statusText ?? "Gerando…"}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {data.status === "error" && data.error && (
            <motion.div className="node-error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <AlertTriangle size={13} />
              <span>{data.error}</span>
              {spec.runnable && (
                <button className="retry nodrag" onClick={() => runNode(id)}>
                  <RotateCcw size={12} /> Tentar de novo
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {running && <div className="node-progress" />}
      </div>

      {spec.inputs.map((p, i) => <Port key={p.type} nodeId={id} dir="in" type={p.type} label={p.label} index={i} />)}
      {spec.outputs.map((p, i) => <Port key={p.type} nodeId={id} dir="out" type={p.type} label={p.label} index={i} />)}
    </motion.div>
  );
}
