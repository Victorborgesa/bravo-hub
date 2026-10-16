// OpenAI: GPT Image, Sora e modelos de texto.
import { httpFetch } from "../lib/platform";
import { mediaBlob, mediaDataUrl, saveBase64, saveBytes, type MediaRef } from "../lib/media";
import { aspectToSize, poll, requestJson, requireSecret } from "./http";
import { ProviderError, type ImageJob, type JobContext, type TextJob, type VideoJob } from "./types";

const BASE = "https://api.openai.com/v1";
const auth = async () => ({ Authorization: `Bearer ${await requireSecret("openai", "openai")}` });

export async function openaiImage(job: ImageJob, ctx: JobContext): Promise<MediaRef[]> {
  const size = aspectToSize(job.aspect, ["1024x1024", "1536x1024", "1024x1536"]);
  const h = await auth();
  let res: { data?: { b64_json: string }[] };

  if (job.references.length) {
    const form = new FormData();
    form.append("model", job.model.apiModel);
    form.append("prompt", job.prompt);
    form.append("n", String(job.count));
    form.append("size", size);
    for (const [i, ref] of job.references.entries()) {
      form.append("image[]", await mediaBlob(ref), `ref-${i}.png`);
    }
    res = await requestJson("openai", `${BASE}/images/edits`, { method: "POST", headers: h, body: form }, ctx);
  } else {
    res = await requestJson(
      "openai",
      `${BASE}/images/generations`,
      {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ model: job.model.apiModel, prompt: job.prompt, n: job.count, size }),
      },
      ctx,
    );
  }
  const items = res.data ?? [];
  if (!items.length) throw new ProviderError("openai", "Nenhuma imagem retornada.");
  return Promise.all(items.map((d) => saveBase64(d.b64_json, "image/png", { model: job.model.label, prompt: job.prompt })));
}

interface SoraVideo {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  progress?: number;
  error?: { message: string };
}

export async function openaiVideo(job: VideoJob, ctx: JobContext): Promise<MediaRef[]> {
  const h = await auth();
  const form = new FormData();
  form.append("model", job.model.apiModel);
  form.append("prompt", job.prompt);
  form.append("seconds", String(job.duration));
  form.append("size", job.aspect === "9:16" ? "720x1280" : "1280x720");
  // O quadro inicial precisa ter exatamente o mesmo tamanho do vídeo.
  if (job.firstFrame) form.append("input_reference", await mediaBlob(job.firstFrame), "frame.png");

  const created = await requestJson<SoraVideo>("openai", `${BASE}/videos`, { method: "POST", headers: h, body: form }, ctx);
  await poll(async () => {
    const v = await requestJson<SoraVideo>("openai", `${BASE}/videos/${created.id}`, { headers: h }, ctx);
    if (v.status === "failed") throw new ProviderError("openai", v.error?.message ?? "Falha na geração do vídeo");
    if (v.progress != null) ctx.onStatus?.(`Processando… ${Math.round(v.progress)}%`);
    return v.status === "completed" ? v : null;
  }, ctx, { interval: 8000 });

  ctx.onStatus?.("Baixando vídeo…");
  const res = await httpFetch(`${BASE}/videos/${created.id}/content`, { headers: h });
  if (!res.ok) throw new ProviderError("openai", `Falha ao baixar o vídeo (${res.status})`);
  return [await saveBytes(new Uint8Array(await res.arrayBuffer()), "video/mp4", { model: job.model.label, prompt: job.prompt })];
}

export async function openaiText(job: TextJob, ctx: JobContext): Promise<string> {
  const images = await Promise.all(
    job.images.map(async (r) => ({ type: "image_url", image_url: { url: await mediaDataUrl(r) } })),
  );
  const res = await requestJson<{ choices: { message: { content: string } }[] }>(
    "openai",
    `${BASE}/chat/completions`,
    {
      method: "POST",
      headers: { ...(await auth()), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: job.model.apiModel,
        messages: [
          { role: "system", content: job.system },
          { role: "user", content: [{ type: "text", text: job.prompt }, ...images] },
        ],
      }),
    },
    ctx,
  );
  return res.choices[0]?.message.content?.trim() ?? "";
}
