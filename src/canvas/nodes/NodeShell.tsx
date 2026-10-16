import { Handle, Position, useEdges } from "@xyflow/react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Play, Square, X, AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { cancelNode, runNode } from "../engine";
import { handleId, NODE_SPECS, type BaseNodeData, type NodeKind, type PortType } from "../ports";
import { useSpaces } from "../../store/spaces";
import { NodeIcon } from "./icons";

interface Props {
  id: string;
  kind: NodeKind;
  data: BaseNodeData;
  selected?: boolean;
  children: ReactNode;
  runLabel?: string;
  footer?: ReactNode;
  width?: number;
}

function PortRow({ nodeId, dir, type, label }: { nodeId: string; dir: "in" | "out"; type: PortType; label: string }) {
  const edges = useEdges();
  const hid = handleId(dir, type);
  const connected = edges.some((e) => (dir === "in" ? e.target === nodeId && e.targetHandle === hid : e.source === nodeId && e.sourceHandle === hid));
  return (
    <div className={`port-row ${dir}`}>
      <Handle
        type={dir === "in" ? "target" : "source"}
        position={dir === "in" ? Position.Left : Position.Right}
        id={hid}
        className={`port port-${type} ${connected ? "is-connected" : ""}`}
      />
      <span className="port-label">{label}</span>
    </div>
  );
}

export function NodeShell({ id, kind, data, selected, children, runLabel = "Gerar", footer, width = 300 }: Props) {
  const spec = NODE_SPECS[kind];
  const removeNode = useSpaces((s) => s.removeNode);
  const running = data.status === "running";

  return (
    <motion.div
      className={`node node-${kind} ${selected ? "is-selected" : ""} ${running ? "is-running" : ""}`}
      style={{ width }}
      initial={{ opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="node-head">
        <NodeIcon kind={kind} />
        <span className="node-title">{spec.title}</span>
        <AnimatePresence>
          {data.status === "done" && (
            <motion.span className="node-dot ok" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} />
          )}
          {data.status === "error" && (
            <motion.span className="node-dot err" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} />
          )}
        </AnimatePresence>
        <button className="icon-btn node-close nodrag" onClick={() => removeNode(id)} title="Remover node">
          <X size={14} />
        </button>
      </header>

      {(spec.inputs.length > 0 || spec.outputs.length > 0) && (
        <div className="node-ports">
          <div>
            {spec.inputs.map((p) => (
              <PortRow key={p.type} nodeId={id} dir="in" type={p.type} label={p.label} />
            ))}
          </div>
          <div>
            {spec.outputs.map((p) => (
              <PortRow key={p.type} nodeId={id} dir="out" type={p.type} label={p.label} />
            ))}
          </div>
        </div>
      )}

      <div className="node-body">{children}</div>

      <AnimatePresence>
        {data.status === "error" && data.error && (
          <motion.div className="node-error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <AlertTriangle size={13} /> <span>{data.error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {(spec.runnable || footer) && (
        <footer className="node-foot">
          {footer}
          {spec.runnable &&
            (running ? (
              <button className="btn btn-run is-running nodrag" onClick={() => cancelNode(id)}>
                <Loader2 size={14} className="spin" />
                <span>{data.statusText ?? "Gerando…"}</span>
                <Square size={11} className="stop" />
              </button>
            ) : (
              <button className="btn btn-run nodrag" onClick={() => runNode(id)}>
                <Play size={13} /> {runLabel}
              </button>
            ))}
        </footer>
      )}
      {running && <div className="node-progress" />}
    </motion.div>
  );
}
