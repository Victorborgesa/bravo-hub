import type { MediaRef } from "../lib/media";

export type ProviderId = "google" | "openai" | "bytedance" | "kling" | "minimax" | "replicate";
export type Capability = "image" | "video" | "text" | "upscale";

export interface Price {
  /** Valor estimado em dólar por unidade. Confira sempre na página oficial. */
  usd: number;
  unit: "imagem" | "segundo" | "execução" | "1M tokens";
}

export interface ModelDef {
  id: string;
  label: string;
  provider: ProviderId;
  capability: Capability;
  /** Identificador exato enviado para a API do fabricante. */
  apiModel: string;
  /** Aceita imagens de referência (imagem) ou quadro inicial (vídeo). */
  acceptsImage?: boolean;
  /** Vídeo que exige uma imagem inicial. */
  requiresImage?: boolean;
  aspects: string[];
  durations?: number[];
  /** Resolução enviada a APIs de vídeo que pedem esse campo. */
  resolution?: string;
  price: Price;
  note?: string;
}

export interface ImageJob {
  model: ModelDef;
  prompt: string;
  references: MediaRef[];
  aspect: string;
  count: number;
}

export interface VideoJob {
  model: ModelDef;
  prompt: string;
  firstFrame?: MediaRef;
  aspect: string;
  duration: number;
}

export interface UpscaleJob {
  image: MediaRef;
  scale: number;
  creativity: number;
  prompt?: string;
}

export interface TextJob {
  model: ModelDef;
  system: string;
  prompt: string;
  images: MediaRef[];
  /** Pede resposta rápida (pouco raciocínio), para tarefas curtas. */
  fast?: boolean;
}

export interface JobContext {
  signal?: AbortSignal;
  onStatus?: (status: string) => void;
}

export class ProviderError extends Error {
  constructor(
    public provider: ProviderId,
    message: string,
  ) {
    super(message);
  }
}
