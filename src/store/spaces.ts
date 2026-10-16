import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { uid } from "../lib/media";
import type { BaseNodeData, NodeKind } from "../canvas/ports";
import { modelsFor } from "../providers/catalog";

export type FlowNode = Node<BaseNodeData, NodeKind>;

export interface Space {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  nodes: FlowNode[];
  edges: Edge[];
}

function defaults(kind: NodeKind): BaseNodeData {
  switch (kind) {
    case "text": return { text: "" };
    case "list": return { items: ["", ""] };
    case "assistant": return { modelId: modelsFor("text")[0].id, mode: "prompt", prompt: "" };
    case "upload": return { gallery: [] };
    case "image": return { modelId: modelsFor("image")[0].id, prompt: "", aspect: "1:1", count: 1, gallery: [] };
    case "video": return { modelId: modelsFor("video")[0].id, prompt: "", aspect: "16:9", duration: 8, gallery: [] };
    case "upscale": return { scale: 2, creativity: 0.35, gallery: [] };
  }
}

function starterSpace(name: string): Space {
  const now = Date.now();
  const t = uid();
  const i = uid();
  const v = uid();
  return {
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    nodes: [
      { id: t, type: "text", position: { x: 0, y: 80 }, data: { text: "Fachada de edifício residencial contemporâneo ao entardecer, concreto aparente e madeira, paisagismo com gramíneas, luz quente nas janelas, fotografia arquitetônica" } },
      { id: i, type: "image", position: { x: 380, y: 0 }, data: defaults("image") },
      { id: v, type: "video", position: { x: 780, y: 0 }, data: { ...defaults("video"), prompt: "Câmera avança lentamente em direção à fachada, folhas balançando com o vento" } },
    ],
    edges: [
      { id: uid(), source: t, sourceHandle: "out-text", target: i, targetHandle: "in-text" },
      { id: uid(), source: i, sourceHandle: "out-image", target: v, targetHandle: "in-image" },
    ],
  };
}

interface SpacesState {
  spaces: Space[];
  activeId: string | null;
  open: (id: string | null) => void;
  create: (name?: string) => string;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (c: Connection) => void;
  addNode: (kind: NodeKind, position: { x: number; y: number }) => void;
  updateNode: (nodeId: string, patch: Partial<BaseNodeData>) => void;
  removeNode: (nodeId: string) => void;
}

const touch = (space: Space, patch: Partial<Space>): Space => ({ ...space, ...patch, updatedAt: Date.now() });

export const useSpaces = create<SpacesState>()(
  persist(
    (set, get) => {
      const mutateActive = (fn: (s: Space) => Partial<Space>) =>
        set((st) => ({
          spaces: st.spaces.map((s) => (s.id === st.activeId ? touch(s, fn(s)) : s)),
        }));

      return {
        spaces: [],
        activeId: null,
        open: (id) => set({ activeId: id }),
        create: (name = "Novo space") => {
          const space = starterSpace(name);
          set((st) => ({ spaces: [space, ...st.spaces], activeId: space.id }));
          return space.id;
        },
        rename: (id, name) => set((st) => ({ spaces: st.spaces.map((s) => (s.id === id ? touch(s, { name }) : s)) })),
        remove: (id) =>
          set((st) => ({
            spaces: st.spaces.filter((s) => s.id !== id),
            activeId: st.activeId === id ? null : st.activeId,
          })),
        duplicate: (id) => {
          const src = get().spaces.find((s) => s.id === id);
          if (!src) return;
          const copy: Space = { ...structuredClone(src), id: uid(), name: `${src.name} (cópia)`, createdAt: Date.now(), updatedAt: Date.now() };
          set((st) => ({ spaces: [copy, ...st.spaces] }));
        },
        onNodesChange: (changes) => mutateActive((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),
        onEdgesChange: (changes) => mutateActive((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),
        onConnect: (c) => mutateActive((s) => ({ edges: addEdge({ ...c, id: uid() }, s.edges) })),
        addNode: (kind, position) =>
          mutateActive((s) => ({
            nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), { id: uid(), type: kind, position, data: defaults(kind), selected: true }],
          })),
        updateNode: (nodeId, patch) =>
          set((st) => ({
            spaces: st.spaces.map((s) =>
              s.nodes.some((n) => n.id === nodeId)
                ? touch(s, { nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)) })
                : s,
            ),
          })),
        removeNode: (nodeId) =>
          mutateActive((s) => ({
            nodes: s.nodes.filter((n) => n.id !== nodeId),
            edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
          })),
      };
    },
    {
      name: "bravo-spaces",
      version: 1,
      // Jobs interrompidos pelo fechamento do app não continuam rodando.
      merge: (persisted, current) => {
        const p = persisted as Partial<SpacesState>;
        const spaces = (p.spaces ?? []).map((s) => ({
          ...s,
          nodes: s.nodes.map((n) =>
            n.data.status === "running" ? { ...n, data: { ...n.data, status: "idle" as const, statusText: undefined } } : n,
          ),
        }));
        return { ...current, ...p, spaces, activeId: null };
      },
    },
  ),
);

export const useActiveSpace = () => useSpaces((st) => st.spaces.find((s) => s.id === st.activeId) ?? null);
