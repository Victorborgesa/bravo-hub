import type { MediaRef } from "../lib/media";

export type PortType = "text" | "image" | "video";
export type NodeKind = "text" | "list" | "assistant" | "upload" | "image" | "video" | "upscale";

export interface Port {
  type: PortType;
  label: string;
}

export interface NodeSpec {
  kind: NodeKind;
  title: string;
  hint: string;
  inputs: Port[];
  outputs: Port[];
  runnable: boolean;
}

export const NODE_SPECS: Record<NodeKind, NodeSpec> = {
  text: { kind: "text", title: "Texto", hint: "Prompt ou anotação", inputs: [], outputs: [{ type: "text", label: "Texto" }], runnable: false },
  list: { kind: "list", title: "Lista", hint: "Vários prompts, um resultado por item", inputs: [], outputs: [{ type: "text", label: "Itens" }], runnable: false },
  assistant: { kind: "assistant", title: "Assistente", hint: "Cria e refina prompts, descreve imagens", inputs: [{ type: "text", label: "Texto" }, { type: "image", label: "Imagem" }], outputs: [{ type: "text", label: "Texto" }], runnable: true },
  upload: { kind: "upload", title: "Upload", hint: "Imagens do seu computador", inputs: [], outputs: [{ type: "image", label: "Imagem" }], runnable: false },
  image: { kind: "image", title: "Gerador de imagem", hint: "Texto e referências viram imagem", inputs: [{ type: "text", label: "Prompt" }, { type: "image", label: "Referências" }], outputs: [{ type: "image", label: "Imagem" }], runnable: true },
  video: { kind: "video", title: "Gerador de vídeo", hint: "Texto ou imagem viram vídeo", inputs: [{ type: "text", label: "Prompt" }, { type: "image", label: "Quadro inicial" }], outputs: [{ type: "video", label: "Vídeo" }], runnable: true },
  upscale: { kind: "upscale", title: "Upscale", hint: "Clarity Upscaler", inputs: [{ type: "image", label: "Imagem" }], outputs: [{ type: "image", label: "Imagem" }], runnable: true },
};

export const handleId = (dir: "in" | "out", type: PortType) => `${dir}-${type}`;
export const handleType = (id?: string | null): PortType | null =>
  (id?.split("-")[1] as PortType | undefined) ?? null;

export interface NodeOutputs {
  texts?: string[];
  images?: MediaRef[];
  videos?: MediaRef[];
}

export interface BaseNodeData {
  [key: string]: unknown;
  status?: "idle" | "running" | "done" | "error";
  statusText?: string;
  error?: string;
  outputs?: NodeOutputs;
  gallery?: MediaRef[];
  // Campos específicos de cada tipo de node.
  text?: string;
  items?: string[];
  prompt?: string;
  modelId?: string;
  aspect?: string;
  count?: number;
  duration?: number;
  scale?: number;
  creativity?: number;
  mode?: string;
}
