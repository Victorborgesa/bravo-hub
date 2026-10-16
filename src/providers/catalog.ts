import type { ModelDef, ProviderId } from "./types";
import { useModelOverrides } from "../store/models";

// Catálogo central de modelos (atualizado em outubro/2026). Os fabricantes
// lançam e aposentam versões com frequência: o ID de cada modelo pode ser
// corrigido em Ajustes > Modelos sem mexer no código.
// Preços são estimativas de fontes públicas, só para o painel de custos.

export const PROVIDERS: Record<ProviderId, { name: string; site: string; secrets: { key: string; label: string }[] }> = {
  google: {
    name: "Google",
    site: "https://aistudio.google.com/apikey",
    secrets: [{ key: "google", label: "Gemini API key" }],
  },
  openai: {
    name: "OpenAI",
    site: "https://platform.openai.com/api-keys",
    secrets: [{ key: "openai", label: "API key" }],
  },
  bytedance: {
    name: "ByteDance (BytePlus ModelArk)",
    site: "https://console.byteplus.com/ark",
    secrets: [{ key: "bytedance", label: "ModelArk API key" }],
  },
  kling: {
    name: "Kling",
    site: "https://app.klingai.com/global/dev",
    secrets: [
      { key: "kling_access", label: "Access key" },
      { key: "kling_secret", label: "Secret key" },
    ],
  },
  minimax: {
    name: "MiniMax",
    site: "https://www.minimax.io/platform",
    secrets: [{ key: "minimax", label: "API key" }],
  },
  replicate: {
    name: "Replicate",
    site: "https://replicate.com/account/api-tokens",
    secrets: [{ key: "replicate", label: "API token" }],
  },
};

const IMG_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
const VID_ASPECTS = ["16:9", "9:16", "1:1"];

export const MODELS: ModelDef[] = [
  // Imagem
  { id: "nano-banana-pro", label: "Nano Banana Pro", provider: "google", capability: "image", apiModel: "gemini-3-pro-image", acceptsImage: true, aspects: IMG_ASPECTS, price: { usd: 0.134, unit: "imagem" } },
  { id: "nano-banana-2-1", label: "Nano Banana 2.1", provider: "google", capability: "image", apiModel: "gemini-nano-banana-2.1", acceptsImage: true, aspects: IMG_ASPECTS, price: { usd: 0.034, unit: "imagem" } },
  { id: "nano-banana-2-lite", label: "Nano Banana 2 Lite", provider: "google", capability: "image", apiModel: "gemini-3.1-flash-lite-image", acceptsImage: true, aspects: IMG_ASPECTS, price: { usd: 0.02, unit: "imagem" } },
  { id: "gpt-image-2-5-sunburst", label: "GPT Image 2.5 Sunburst", provider: "openai", capability: "image", apiModel: "gpt-image-2.5-sunburst", acceptsImage: true, aspects: ["1:1", "3:2", "2:3"], price: { usd: 0.05, unit: "imagem" }, note: "Mais preciso para edição" },
  { id: "gpt-image-2-5-flare", label: "GPT Image 2.5 Flare", provider: "openai", capability: "image", apiModel: "gpt-image-2.5-flare", acceptsImage: true, aspects: ["1:1", "3:2", "2:3"], price: { usd: 0.036, unit: "imagem" }, note: "Mais rápido" },
  { id: "gpt-image-2", label: "GPT Image 2", provider: "openai", capability: "image", apiModel: "gpt-image-2", acceptsImage: true, aspects: ["1:1", "3:2", "2:3"], price: { usd: 0.04, unit: "imagem" } },
  { id: "seedream-5-pro", label: "Seedream 5.0 Pro", provider: "bytedance", capability: "image", apiModel: "dola-seedream-5-0-pro-260628", acceptsImage: true, aspects: IMG_ASPECTS, price: { usd: 0.045, unit: "imagem" } },
  { id: "seedream-5-flash", label: "Seedream 5.0 Flash", provider: "bytedance", capability: "image", apiModel: "dola-seedream-5-0-flash-260915", acceptsImage: true, aspects: IMG_ASPECTS, price: { usd: 0.025, unit: "imagem" } },
  { id: "seedream-4-5", label: "Seedream 4.5", provider: "bytedance", capability: "image", apiModel: "seedream-4-5-251128", acceptsImage: true, aspects: IMG_ASPECTS, price: { usd: 0.04, unit: "imagem" } },
  { id: "kling-image-3", label: "Kling Image 3.0", provider: "kling", capability: "image", apiModel: "kling-v3", acceptsImage: true, aspects: ["1:1", "16:9", "9:16"], price: { usd: 0.028, unit: "imagem" } },
  { id: "minimax-image", label: "MiniMax Image-01", provider: "minimax", capability: "image", apiModel: "image-01", acceptsImage: true, aspects: IMG_ASPECTS, price: { usd: 0.0035, unit: "imagem" } },

  // Vídeo
  { id: "veo-3-1", label: "Veo 3.1", provider: "google", capability: "video", apiModel: "veo-3.1-generate-001", acceptsImage: true, aspects: ["16:9", "9:16"], durations: [4, 6, 8], price: { usd: 0.4, unit: "segundo" } },
  { id: "veo-3-1-fast", label: "Veo 3.1 Fast", provider: "google", capability: "video", apiModel: "veo-3.1-fast-generate-001", acceptsImage: true, aspects: ["16:9", "9:16"], durations: [4, 6, 8], price: { usd: 0.15, unit: "segundo" } },
  { id: "veo-3-1-lite", label: "Veo 3.1 Lite", provider: "google", capability: "video", apiModel: "veo-3.1-lite-generate-001", acceptsImage: true, aspects: ["16:9", "9:16"], durations: [4, 6, 8], price: { usd: 0.08, unit: "segundo" } },
  { id: "seedance-2", label: "Seedance 2.0", provider: "bytedance", capability: "video", apiModel: "dreamina-seedance-2-0-260128", acceptsImage: true, aspects: VID_ASPECTS, durations: [5, 8, 10, 15], resolution: "1080p", price: { usd: 0.15, unit: "segundo" } },
  { id: "seedance-2-fast", label: "Seedance 2.0 Fast", provider: "bytedance", capability: "video", apiModel: "dreamina-seedance-2-0-fast-260128", acceptsImage: true, aspects: VID_ASPECTS, durations: [5, 8, 10, 15], resolution: "720p", price: { usd: 0.08, unit: "segundo" } },
  { id: "seedance-2-mini", label: "Seedance 2.0 Mini", provider: "bytedance", capability: "video", apiModel: "dreamina-seedance-2-0-mini-260615", acceptsImage: true, aspects: VID_ASPECTS, durations: [5, 8, 10, 15], resolution: "720p", price: { usd: 0.04, unit: "segundo" } },
  { id: "kling-3", label: "Kling 3.0", provider: "kling", capability: "video", apiModel: "kling-v3", acceptsImage: true, aspects: VID_ASPECTS, durations: [5, 10, 15], price: { usd: 0.084, unit: "segundo" } },
  { id: "kling-3-turbo", label: "Kling 3.0 Turbo", provider: "kling", capability: "video", apiModel: "kling-3.0-turbo", acceptsImage: true, aspects: VID_ASPECTS, durations: [5, 10, 15], price: { usd: 0.06, unit: "segundo" } },
  { id: "minimax-h3", label: "MiniMax H3 (Hailuo 3)", provider: "minimax", capability: "video", apiModel: "MiniMax-H3", acceptsImage: true, aspects: ["16:9"], durations: [6, 10, 15], resolution: "768P", price: { usd: 0.08, unit: "segundo" } },
  { id: "minimax-h3-max", label: "MiniMax H3 Max", provider: "minimax", capability: "video", apiModel: "MiniMax-H3-Max", acceptsImage: true, aspects: ["16:9"], durations: [6, 10, 15], resolution: "768P", price: { usd: 0.05, unit: "segundo" } },

  // Upscale
  { id: "clarity", label: "Clarity Upscaler", provider: "replicate", capability: "upscale", apiModel: "philz1337x/clarity-upscaler", aspects: [], price: { usd: 0.04, unit: "execução" } },

  // Texto (assistente)
  { id: "gemini-flash", label: "Gemini Flash", provider: "google", capability: "text", apiModel: "gemini-flash-latest", acceptsImage: true, aspects: [], price: { usd: 2.5, unit: "1M tokens" } },
  { id: "gpt-text", label: "GPT-5 mini", provider: "openai", capability: "text", apiModel: "gpt-5-mini", acceptsImage: true, aspects: [], price: { usd: 2, unit: "1M tokens" } },
  { id: "minimax-text", label: "MiniMax M2", provider: "minimax", capability: "text", apiModel: "MiniMax-M2", aspects: [], price: { usd: 1.2, unit: "1M tokens" } },
];

/** Aplica o ID de API editado em Ajustes, se houver. */
function withOverride(m: ModelDef): ModelDef {
  const custom = useModelOverrides.getState().apiIds[m.id];
  return custom ? { ...m, apiModel: custom } : m;
}

export const modelsFor = (capability: ModelDef["capability"]) =>
  MODELS.filter((m) => m.capability === capability).map(withOverride);

export const modelById = (id: string) => {
  const m = MODELS.find((x) => x.id === id);
  return m && withOverride(m);
};

/** Opção "Auto": escolhe um bom modelo conforme o que está conectado ao node. */
export const AUTO_ID = "auto";

const AUTO_PICK: Partial<Record<ModelDef["capability"], { plain: string; withImage: string }>> = {
  image: { plain: "nano-banana-2-1", withImage: "nano-banana-pro" },
  video: { plain: "veo-3-1-fast", withImage: "kling-3" },
  text: { plain: "gemini-flash", withImage: "gemini-flash" },
};

export function resolveModel(id: string | undefined, capability: ModelDef["capability"], hasImage: boolean): ModelDef | undefined {
  if (id === AUTO_ID || !id) {
    const pick = AUTO_PICK[capability];
    return pick && modelById(hasImage ? pick.withImage : pick.plain);
  }
  return modelById(id);
}

/** Modelos em destaque no topo do seletor. */
export const FEATURED: Record<string, string[]> = {
  image: ["nano-banana-pro", "gpt-image-2-5-sunburst", "seedream-5-pro", "kling-image-3"],
  video: ["veo-3-1", "kling-3", "seedance-2", "minimax-h3"],
  text: ["gemini-flash", "gpt-text"],
};
