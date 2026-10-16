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
import { MODELS, modelsFor } from "../providers/catalog";
import type { Capability } from "../providers/types";

export type FlowNode = Node<BaseNodeData, NodeKind>;

export interface Space {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  nodes: FlowNode[];
  edges: Edge[];
}

const MODEL_CAPABILITY: Partial<Record<NodeKind, Capability>> = { assistant: "text", image: "image", video: "video" };

function defaults(kind: NodeKind): BaseNodeData {
  switch (kind) {
    case "text": return { text: "" };
    case "list": return { items: ["", ""] };
    case "assistant": return { modelId: modelsFor("text")[0].id, mode: "prompt", prompt: "" };
    case "upload": return { gallery: [] };
    case "image": return { modelId: modelsFor("image")[0].id, prompt: "", aspect: "1:1", count: 1, gallery: [] };
    case "video": return { modelId: modelsFor("video")[0].id, prompt: "", aspect: "16:9", duration: 8, gallery: [] };
    case "upscale": return { scale: 2, creativity: 0.35, gallery: [] };
    case "edit": return { gallery: [] };
  }
}

/** Próximo número de um tipo de node no space ("Gerador de imagem #3"). */
const nextSeq = (nodes: FlowNode[], kind: NodeKind) =>
  nodes.filter((n) => n.type === kind).reduce((m, n) => Math.max(m, n.data.seq ?? 0), 0) + 1;

type Draft = { nodes: FlowNode[]; edges: Edge[] };

function node(kind: NodeKind, x: number, y: number, data: Partial<BaseNodeData> = {}, seq = 1): FlowNode {
  return { id: uid(), type: kind, position: { x, y }, data: { ...defaults(kind), seq, ...data } };
}

function link(a: FlowNode, b: FlowNode, type: "text" | "image"): Edge {
  return { id: uid(), source: a.id, sourceHandle: `out-${type}`, target: b.id, targetHandle: `in-${type}` };
}

export interface SpaceTemplate {
  id: string;
  title: string;
  description: string;
  steps: NodeKind[];
  build: () => Draft;
}

export const TEMPLATES: SpaceTemplate[] = [
  {
    id: "blank",
    title: "Em branco",
    description: "Canvas vazio para montar do zero.",
    steps: [],
    build: () => ({ nodes: [], edges: [] }),
  },
  {
    id: "text-image-video",
    title: "Texto → Imagem → Vídeo",
    description: "Um prompt vira imagem, e a imagem escolhida vira vídeo.",
    steps: ["text", "image", "video"],
    build: () => {
      const t = node("text", 0, 60, { text: "Fachada de edifício residencial contemporâneo ao entardecer, concreto aparente e madeira, paisagismo com gramíneas, luz quente nas janelas, fotografia arquitetônica" });
      const i = node("image", 420, 0);
      const v = node("video", 900, 0, { prompt: "Câmera avança lentamente em direção à fachada, folhas balançando com o vento" });
      return { nodes: [t, i, v], edges: [link(t, i, "text"), link(i, v, "image")] };
    },
  },
  {
    id: "render-variations-upscale",
    title: "Render → Variações → Upscale",
    description: "Suba um render, gere variações e faça o upscale da melhor.",
    steps: ["upload", "image", "upscale"],
    build: () => {
      const u = node("upload", 0, 0);
      const i = node("image", 420, 0, { count: 4, modelId: "nano-banana-pro", prompt: "Crie uma variação desta imagem mantendo a arquitetura, o enquadramento e os materiais, mudando apenas a luz e a atmosfera para fim de tarde" });
      const x = node("upscale", 900, 0);
      return { nodes: [u, i, x], edges: [link(u, i, "image"), link(i, x, "image")] };
    },
  },
  {
    id: "batch",
    title: "Lote de imagens",
    description: "Uma lista de prompts gera uma imagem para cada item.",
    steps: ["list", "image"],
    build: () => {
      const l = node("list", 0, 0, { items: ["Fachada ao amanhecer com névoa leve", "Fachada ao meio-dia com céu azul limpo", "Fachada à noite com iluminação de destaque"] });
      const i = node("image", 420, 0, { aspect: "16:9" });
      return { nodes: [l, i], edges: [link(l, i, "text")] };
    },
  },
  {
    id: "animate",
    title: "Animar imagem",
    description: "Transforme um render pronto em vídeo.",
    steps: ["upload", "video"],
    build: () => {
      const u = node("upload", 0, 0);
      const v = node("video", 420, 0, { prompt: "Câmera faz uma órbita lenta ao redor do edifício, movimento estável de drone" });
      return { nodes: [u, v], edges: [link(u, v, "image")] };
    },
  },
  {
    id: "assistant",
    title: "Ideia → Assistente → Imagem",
    description: "Descreva a ideia em português; o assistente escreve o prompt.",
    steps: ["text", "assistant", "image"],
    build: () => {
      const t = node("text", 0, 40, { text: "Casa de campo moderna em meio à mata, com varanda ampla e piscina" });
      const a = node("assistant", 380, 0);
      const i = node("image", 820, 0, { aspect: "16:9" });
      return { nodes: [t, a, i], edges: [link(t, a, "text"), link(a, i, "text")] };
    },
  },
];

function spaceFrom(name: string, templateId: string): Space {
  const now = Date.now();
  const tpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[1];
  return { id: uid(), name, createdAt: now, updatedAt: now, ...tpl.build() };
}

interface Snapshot {
  nodes: FlowNode[];
  edges: Edge[];
}

interface SpacesState {
  spaces: Space[];
  activeId: string | null;
  /** Histórico de desfazer/refazer do space aberto (só em memória). */
  past: Snapshot[];
  future: Snapshot[];
  open: (id: string | null) => void;
  create: (name?: string, templateId?: string) => string;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (c: Connection) => void;
  addNode: (kind: NodeKind, position: { x: number; y: number }, data?: Partial<BaseNodeData>) => string;
  updateNode: (nodeId: string, patch: Partial<BaseNodeData>) => void;
  removeNodes: (nodeIds: string[]) => void;
  duplicateNodes: (nodeIds: string[]) => void;
  snapshot: () => void;
  undo: () => void;
  redo: () => void;
}

const touch = (space: Space, patch: Partial<Space>): Space => ({ ...space, ...patch, updatedAt: Date.now() });
const HISTORY = 60;

export const useSpaces = create<SpacesState>()(
  persist(
    (set, get) => {
      const active = () => get().spaces.find((s) => s.id === get().activeId);
      const mutateActive = (fn: (s: Space) => Partial<Space>) =>
        set((st) => ({
          spaces: st.spaces.map((s) => (s.id === st.activeId ? touch(s, fn(s)) : s)),
        }));
      // Uma ação do usuário pode gerar várias mudanças seguidas (ex.: excluir um
      // node remove também suas conexões); elas viram um único passo de desfazer.
      let lastSnap = 0;
      const snapshot = () => {
        const s = active();
        if (!s || Date.now() - lastSnap < 80) return;
        lastSnap = Date.now();
        set((st) => ({ past: [...st.past, { nodes: s.nodes, edges: s.edges }].slice(-HISTORY), future: [] }));
      };

      return {
        spaces: [],
        activeId: null,
        past: [],
        future: [],
        open: (id) => set({ activeId: id, past: [], future: [] }),
        create: (name = "Novo space", templateId = "text-image-video") => {
          const space = spaceFrom(name, templateId);
          set((st) => ({ spaces: [space, ...st.spaces], activeId: space.id, past: [], future: [] }));
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
        onNodesChange: (changes) => {
          // Remoções e fim de arraste entram no histórico.
          if (changes.some((c) => c.type === "remove" || (c.type === "position" && c.dragging === false))) snapshot();
          mutateActive((s) => {
            const removed = new Set(changes.filter((c) => c.type === "remove").map((c) => c.id));
            return {
              nodes: applyNodeChanges(changes, s.nodes),
              edges: removed.size ? s.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)) : s.edges,
            };
          });
        },
        onEdgesChange: (changes) => {
          if (changes.some((c) => c.type === "remove")) snapshot();
          mutateActive((s) => ({ edges: applyEdgeChanges(changes, s.edges) }));
        },
        onConnect: (c) => {
          snapshot();
          // Uma entrada de quadro inicial/prompt aceita várias conexões; evitamos duplicatas exatas.
          mutateActive((s) => ({ edges: addEdge({ ...c, id: uid() }, s.edges) }));
        },
        addNode: (kind, position, data) => {
          snapshot();
          const id = uid();
          mutateActive((s) => ({
            nodes: [
              ...s.nodes.map((n) => ({ ...n, selected: false })),
              { id, type: kind, position, data: { ...defaults(kind), seq: nextSeq(s.nodes, kind), ...data }, selected: true },
            ],
          }));
          return id;
        },
        updateNode: (nodeId, patch) =>
          set((st) => ({
            spaces: st.spaces.map((s) =>
              s.nodes.some((n) => n.id === nodeId)
                ? touch(s, { nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)) })
                : s,
            ),
          })),
        removeNodes: (ids) => {
          snapshot();
          const drop = new Set(ids);
          mutateActive((s) => ({
            nodes: s.nodes.filter((n) => !drop.has(n.id)),
            edges: s.edges.filter((e) => !drop.has(e.source) && !drop.has(e.target)),
          }));
        },
        duplicateNodes: (ids) => {
          const s = active();
          if (!s || !ids.length) return;
          snapshot();
          const map = new Map(ids.map((id) => [id, uid()]));
          const seqs = new Map<NodeKind, number>();
          const copies = s.nodes
            .filter((n) => map.has(n.id))
            .map((n) => {
              const kind = n.type!;
              const seq = seqs.get(kind) ?? nextSeq(s.nodes, kind);
              seqs.set(kind, seq + 1);
              return { ...structuredClone(n), id: map.get(n.id)!, position: { x: n.position.x + 40, y: n.position.y + 40 }, selected: true, data: { ...structuredClone(n.data), seq, status: "idle" as const } };
            });
          // Conexões internas à seleção também são copiadas.
          const edges = s.edges
            .filter((e) => map.has(e.source) && map.has(e.target))
            .map((e) => ({ ...e, id: uid(), source: map.get(e.source)!, target: map.get(e.target)! }));
          mutateActive((sp) => ({
            nodes: [...sp.nodes.map((n) => ({ ...n, selected: false })), ...copies],
            edges: [...sp.edges, ...edges],
          }));
        },
        snapshot,
        undo: () => {
          const { past } = get();
          const s = active();
          if (!s || !past.length) return;
          const prev = past[past.length - 1];
          set((st) => ({ past: st.past.slice(0, -1), future: [{ nodes: s.nodes, edges: s.edges }, ...st.future].slice(0, HISTORY) }));
          mutateActive(() => prev);
        },
        redo: () => {
          const { future } = get();
          const s = active();
          if (!s || !future.length) return;
          const next = future[0];
          set((st) => ({ future: st.future.slice(1), past: [...st.past, { nodes: s.nodes, edges: s.edges }] }));
          mutateActive(() => next);
        },
      };
    },
    {
      name: "bravo-spaces",
      version: 2,
      partialize: (st) => ({ spaces: st.spaces }),
      merge: (persisted, current) => {
        const p = persisted as Partial<SpacesState>;
        const known = new Set(MODELS.map((m) => m.id));
        const spaces = (p.spaces ?? []).map((s) => ({
          ...s,
          nodes: s.nodes.map((n, i) => {
            let data = n.data;
            // Jobs interrompidos pelo fechamento do app não continuam rodando.
            if (data.status === "running") data = { ...data, status: "idle", statusText: undefined };
            // Modelos aposentados voltam para o padrão do tipo.
            const cap = MODEL_CAPABILITY[n.type!];
            if (cap && data.modelId && !known.has(data.modelId)) data = { ...data, modelId: modelsFor(cap)[0].id };
            if (data.seq == null) data = { ...data, seq: i + 1 };
            return data === n.data ? n : { ...n, data };
          }),
        }));
        return { ...current, spaces, activeId: null };
      },
    },
  ),
);

export const useActiveSpace = () => useSpaces((st) => st.spaces.find((s) => s.id === st.activeId) ?? null);
