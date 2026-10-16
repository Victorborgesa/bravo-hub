// Replicate: Clarity Upscaler.
import { mediaBlob, mediaFileName, saveRemote, type MediaRef } from "../lib/media";
import { poll, requestJson, requireSecret } from "./http";
import { modelById } from "./catalog";
import { ProviderError, type JobContext, type UpscaleJob } from "./types";

const BASE = "https://api.replicate.com/v1";

interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string;
}

// Hash da versão mais recente por modelo (o ID pode ser trocado em Ajustes).
const versions = new Map<string, string>();

/**
 * Envia a imagem pela API de arquivos do Replicate. Imagens grandes (justamente
 * as que mais precisam de upscale) não cabem como data URL no corpo do pedido.
 */
async function uploadImage(image: MediaRef, auth: string, ctx: JobContext): Promise<string> {
  const form = new FormData();
  form.append("content", await mediaBlob(image), mediaFileName(image));
  const res = await requestJson<{ urls?: { get?: string } }>("replicate", `${BASE}/files`, { method: "POST", headers: { Authorization: auth }, body: form }, ctx);
  if (!res.urls?.get) throw new ProviderError("replicate", "Não consegui enviar a imagem para o Replicate.");
  return res.urls.get;
}

export async function clarityUpscale(job: UpscaleJob, ctx: JobContext): Promise<MediaRef[]> {
  const model = modelById("clarity")!;
  const h = { Authorization: `Bearer ${await requireSecret("replicate", "replicate")}`, "Content-Type": "application/json" };

  // Modelos da comunidade exigem o hash da versão; buscamos a mais recente.
  let version = versions.get(model.apiModel);
  if (!version) {
    const info = await requestJson<{ latest_version?: { id: string } }>("replicate", `${BASE}/models/${model.apiModel}`, { headers: h }, ctx);
    version = info.latest_version?.id;
    if (!version) throw new ProviderError("replicate", "Não encontrei a versão do Clarity Upscaler.");
    versions.set(model.apiModel, version);
  }

  ctx.onStatus?.("Enviando imagem…");
  const input: Record<string, unknown> = {
    image: await uploadImage(job.image, h.Authorization, ctx),
    scale_factor: job.scale,
    creativity: job.creativity,
    resemblance: 0.6,
    dynamic: 6,
    output_format: "png",
  };
  if (job.prompt) input.prompt = job.prompt;

  const created = await requestJson<Prediction>(
    "replicate",
    `${BASE}/predictions`,
    { method: "POST", headers: h, body: JSON.stringify({ version, input }) },
    ctx,
  );
  const done = await poll(async () => {
    const p = await requestJson<Prediction>("replicate", `${BASE}/predictions/${created.id}`, { headers: h }, ctx);
    if (p.status === "failed" || p.status === "canceled") throw new ProviderError("replicate", p.error ?? "Falha no upscale");
    return p.status === "succeeded" ? p : null;
  }, ctx, { interval: 3000 });

  const urls = Array.isArray(done.output) ? done.output : done.output ? [done.output] : [];
  if (!urls.length) throw new ProviderError("replicate", "Upscale concluído sem imagem.");
  return Promise.all(urls.map((u) => saveRemote(u, "image/png", { model: model.label, prompt: `Upscale ${job.scale}x` })));
}
