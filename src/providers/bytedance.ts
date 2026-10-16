// ByteDance via BytePlus ModelArk: Seedream (imagem) e Seedance (vídeo).
import { mediaDataUrl, saveRemote, type MediaRef } from "../lib/media";
import { poll, requestJson, requireSecret } from "./http";
import { ProviderError, type ImageJob, type JobContext, type VideoJob } from "./types";

const BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";

async function headers() {
  return { Authorization: `Bearer ${await requireSecret("bytedance", "bytedance")}`, "Content-Type": "application/json" };
}

const SEEDREAM_SIZES: Record<string, string> = {
  "1:1": "2048x2048",
  "16:9": "2560x1440",
  "9:16": "1440x2560",
  "4:3": "2304x1728",
  "3:4": "1728x2304",
  "3:2": "2496x1664",
  "2:3": "1664x2496",
};

export async function seedreamImage(job: ImageJob, ctx: JobContext): Promise<MediaRef[]> {
  const h = await headers();
  const refs = await Promise.all(job.references.map(mediaDataUrl));
  const body: Record<string, unknown> = {
    model: job.model.apiModel,
    prompt: job.prompt,
    size: SEEDREAM_SIZES[job.aspect] ?? "2048x2048",
    response_format: "url",
    watermark: false,
  };
  if (refs.length) body.image = refs.length === 1 ? refs[0] : refs;
  if (job.count > 1) {
    body.sequential_image_generation = "auto";
    body.sequential_image_generation_options = { max_images: job.count };
  }
  const res = await requestJson<{ data?: { url?: string; error?: { message: string } }[] }>(
    "bytedance",
    `${BASE}/images/generations`,
    { method: "POST", headers: h, body: JSON.stringify(body) },
    ctx,
  );
  const urls = (res.data ?? []).map((d) => d.url).filter((u): u is string => !!u);
  if (!urls.length) throw new ProviderError("bytedance", res.data?.[0]?.error?.message ?? "Nenhuma imagem retornada.");
  return Promise.all(urls.map((u) => saveRemote(u, "image/jpeg", { model: job.model.label, prompt: job.prompt })));
}

interface Task {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  content?: { video_url?: string };
  error?: { message: string };
}

export async function seedanceVideo(job: VideoJob, ctx: JobContext): Promise<MediaRef[]> {
  const h = await headers();
  const content: Record<string, unknown>[] = [{ type: "text", text: job.prompt }];
  if (job.firstFrame) {
    content.push({ type: "image_url", image_url: { url: await mediaDataUrl(job.firstFrame) }, role: "first_frame" });
  }
  const task = await requestJson<{ id: string }>(
    "bytedance",
    `${BASE}/contents/generations/tasks`,
    {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        model: job.model.apiModel,
        content,
        ratio: job.firstFrame ? "adaptive" : job.aspect,
        duration: job.duration,
        resolution: job.model.resolution ?? "720p",
        watermark: false,
      }),
    },
    ctx,
  );
  const done = await poll(async () => {
    const t = await requestJson<Task>("bytedance", `${BASE}/contents/generations/tasks/${task.id}`, { headers: h }, ctx);
    if (t.status === "failed" || t.status === "cancelled") throw new ProviderError("bytedance", t.error?.message ?? "Falha na geração");
    return t.status === "succeeded" ? t : null;
  }, ctx);
  const url = done.content?.video_url;
  if (!url) throw new ProviderError("bytedance", "Tarefa concluída sem vídeo.");
  ctx.onStatus?.("Baixando vídeo…");
  return [await saveRemote(url, "video/mp4", { model: job.model.label, prompt: job.prompt })];
}
