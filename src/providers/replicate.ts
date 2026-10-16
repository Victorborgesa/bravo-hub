// Replicate: Clarity Upscaler.
import { mediaDataUrl, saveRemote, type MediaRef } from "../lib/media";
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

let cachedVersion: string | null = null;

export async function clarityUpscale(job: UpscaleJob, ctx: JobContext): Promise<MediaRef[]> {
  const model = modelById("clarity")!;
  const h = { Authorization: `Bearer ${await requireSecret("replicate", "replicate")}`, "Content-Type": "application/json" };

  // Modelos da comunidade exigem o hash da versão; buscamos a mais recente.
  if (!cachedVersion) {
    const info = await requestJson<{ latest_version?: { id: string } }>("replicate", `${BASE}/models/${model.apiModel}`, { headers: h }, ctx);
    cachedVersion = info.latest_version?.id ?? null;
    if (!cachedVersion) throw new ProviderError("replicate", "Não encontrei a versão do Clarity Upscaler.");
  }

  const input: Record<string, unknown> = {
    image: await mediaDataUrl(job.image),
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
    { method: "POST", headers: h, body: JSON.stringify({ version: cachedVersion, input }) },
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
