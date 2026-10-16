import type { ModelDef, ProviderId } from "./types";

// Catálogo central de modelos. Os fabricantes lançam versões novas com
// frequência: para trocar ou incluir um modelo, basta editar esta lista.
// Preços são estimativas de outubro/2026 tiradas de fontes públicas e servem
// só para o painel de custos; confira os valores oficiais de cada fabricante.

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
  { id: "nano-banana-pro", label: "Nano Banana Pro", provider: "google", capability: "image", apiModel: "gemini-3-pro-image-preview", acceptsImage: true, aspects: IMG_ASPECTS, price: { usd: 0.134, unit: "imagem" } },
  { id: "nano-banana-2", label: "Nano Banana 2", provider: "google", capability: "image", apiModel: "gemini-3.1-flash-image-preview", acceptsImage: true, aspects: IMG_ASPECTS, price: { usd: 0.067, unit: "imagem" } },
  { id: "nano-banana", label: "Nano Banana", provider: "google", capability: "image", apiModel: "gemini-2.5-flash-image", acceptsImage: true, aspects: IMG_ASPECTS, price: { usd: 0.039, unit: "imagem" } },
  { id: "imagen-4", label: "Imagen 4", provider: "google", capability: "image", apiModel: "imagen-4.0-generate-001", aspects: ["1:1", "16:9", "9:16", "4:3", "3:4"], price: { usd: 0.04, unit: "imagem" } },
  { id: "imagen-4-ultra", label: "Imagen 4 Ultra", provider: "google", capability: "image", apiModel: "imagen-4.0-ultra-generate-001", aspects: ["1:1", "16:9", "9:16", "4:3", "3:4"], price: { usd: 0.06, unit: "imagem" } },
  { id: "gpt-image", label: "GPT Image 1", provider: "openai", capability: "image", apiModel: "gpt-image-1", acceptsImage: true, aspects: ["1:1", "3:2", "2:3"], price: { usd: 0.167, unit: "imagem" }, note: "Qualidade alta em 1024px" },
  { id: "gpt-image-mini", label: "GPT Image 1 Mini", provider: "openai", capability: "image", apiModel: "gpt-image-1-mini", acceptsImage: true, aspects: ["1:1", "3:2", "2:3"], price: { usd: 0.036, unit: "imagem" } },
  { id: "seedream-4-5", label: "Seedream 4.5", provider: "bytedance", capability: "image", apiModel: "seedream-4-5-251128", acceptsImage: true, aspects: IMG_ASPECTS, price: { usd: 0.04, unit: "imagem" } },
  { id: "seedream-4", label: "Seedream 4.0", provider: "bytedance", capability: "image", apiModel: "seedream-4-0-250828", acceptsImage: true, aspects: IMG_ASPECTS, price: { usd: 0.03, unit: "imagem" } },
  { id: "kling-image", label: "Kling Image 2", provider: "kling", capability: "image", apiModel: "kling-v2", acceptsImage: true, aspects: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"], price: { usd: 0.014, unit: "imagem" } },
  { id: "minimax-image", label: "MiniMax Image-01", provider: "minimax", capability: "image", apiModel: "image-01", acceptsImage: true, aspects: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"], price: { usd: 0.0035, unit: "imagem" } },

  // Vídeo
  { id: "veo-3-1", label: "Veo 3.1", provider: "google", capability: "video", apiModel: "veo-3.1-generate-preview", acceptsImage: true, aspects: ["16:9", "9:16"], durations: [4, 6, 8], price: { usd: 0.4, unit: "segundo" } },
  { id: "veo-3-1-fast", label: "Veo 3.1 Fast", provider: "google", capability: "video", apiModel: "veo-3.1-fast-generate-preview", acceptsImage: true, aspects: ["16:9", "9:16"], durations: [4, 6, 8], price: { usd: 0.15, unit: "segundo" } },
  { id: "sora-2", label: "Sora 2", provider: "openai", capability: "video", apiModel: "sora-2", acceptsImage: true, aspects: ["16:9", "9:16"], durations: [4, 8, 12], price: { usd: 0.1, unit: "segundo" } },
  { id: "sora-2-pro", label: "Sora 2 Pro", provider: "openai", capability: "video", apiModel: "sora-2-pro", acceptsImage: true, aspects: ["16:9", "9:16"], durations: [4, 8, 12], price: { usd: 0.3, unit: "segundo" } },
  { id: "seedance-pro", label: "Seedance 1.0 Pro", provider: "bytedance", capability: "video", apiModel: "seedance-1-0-pro-250528", acceptsImage: true, aspects: VID_ASPECTS, durations: [5, 10], price: { usd: 0.25, unit: "segundo" } },
  { id: "seedance-lite", label: "Seedance 1.0 Lite", provider: "bytedance", capability: "video", apiModel: "seedance-1-0-lite-t2v-250428", aspects: VID_ASPECTS, durations: [5, 10], price: { usd: 0.18, unit: "segundo" } },
  { id: "kling-2-5-turbo", label: "Kling 2.5 Turbo", provider: "kling", capability: "video", apiModel: "kling-v2-5-turbo", acceptsImage: true, aspects: VID_ASPECTS, durations: [5, 10], price: { usd: 0.07, unit: "segundo" } },
  { id: "kling-2-1-master", label: "Kling 2.1 Master", provider: "kling", capability: "video", apiModel: "kling-v2-1-master", acceptsImage: true, aspects: VID_ASPECTS, durations: [5, 10], price: { usd: 0.28, unit: "segundo" } },
  { id: "hailuo-2-3", label: "Hailuo 2.3", provider: "minimax", capability: "video", apiModel: "MiniMax-Hailuo-2.3", acceptsImage: true, aspects: ["16:9"], durations: [6, 10], price: { usd: 0.05, unit: "segundo" } },
  { id: "hailuo-02", label: "Hailuo 02", provider: "minimax", capability: "video", apiModel: "MiniMax-Hailuo-02", acceptsImage: true, aspects: ["16:9"], durations: [6, 10], price: { usd: 0.045, unit: "segundo" } },

  // Upscale
  { id: "clarity", label: "Clarity Upscaler", provider: "replicate", capability: "upscale", apiModel: "philz1337x/clarity-upscaler", aspects: [], price: { usd: 0.04, unit: "execução" } },

  // Texto (assistente)
  { id: "gemini-flash", label: "Gemini 2.5 Flash", provider: "google", capability: "text", apiModel: "gemini-2.5-flash", acceptsImage: true, aspects: [], price: { usd: 2.5, unit: "1M tokens" } },
  { id: "gpt-text", label: "GPT-4.1 mini", provider: "openai", capability: "text", apiModel: "gpt-4.1-mini", acceptsImage: true, aspects: [], price: { usd: 1.6, unit: "1M tokens" } },
  { id: "minimax-text", label: "MiniMax M2", provider: "minimax", capability: "text", apiModel: "MiniMax-M2", aspects: [], price: { usd: 1.2, unit: "1M tokens" } },
];

export const modelsFor = (capability: ModelDef["capability"]) =>
  MODELS.filter((m) => m.capability === capability);

export const modelById = (id: string) => MODELS.find((m) => m.id === id);
