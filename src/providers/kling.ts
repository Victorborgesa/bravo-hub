// Kling: autenticação por JWT (HS256) assinado com access key + secret key.
import { mediaBase64, saveRemote, type MediaRef } from "../lib/media";
import { poll, requestJson, requireSecret } from "./http";
import { ProviderError, type ImageJob, type JobContext, type VideoJob } from "./types";

const BASE = "https://api-singapore.klingai.com";

const b64url = (data: string | ArrayBuffer) => {
  const str = typeof data === "string" ? data : String.fromCharCode(...new Uint8Array(data));
  return btoa(str).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
};

async function token(): Promise<string> {
  const ak = await requireSecret("kling", "kling_access");
  const sk = await requireSecret("kling", "kling_secret");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: ak, exp: now + 1800, nbf: now - 5 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sk), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

interface KlingResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface KlingTask {
  task_id: string;
  task_status: "submitted" | "processing" | "succeed" | "failed";
  task_status_msg?: string;
  task_result?: { videos?: { url: string }[]; images?: { url: string }[] };
}

async function call<T>(path: string, init: RequestInit, ctx: JobContext): Promise<T> {
  const res = await requestJson<KlingResponse<T>>(
    "kling",
    `${BASE}${path}`,
    { ...init, headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" } },
    ctx,
  );
  if (res.code !== 0) throw new ProviderError("kling", res.message);
  return res.data;
}

async function runTask(path: string, body: unknown, ctx: JobContext): Promise<KlingTask> {
  const created = await call<KlingTask>(path, { method: "POST", body: JSON.stringify(body) }, ctx);
  return poll(async () => {
    const t = await call<KlingTask>(`${path}/${created.task_id}`, { method: "GET" }, ctx);
    if (t.task_status === "failed") throw new ProviderError("kling", t.task_status_msg ?? "Falha na geração");
    return t.task_status === "succeed" ? t : null;
  }, ctx);
}

export async function klingVideo(job: VideoJob, ctx: JobContext): Promise<MediaRef[]> {
  const common = {
    model_name: job.model.apiModel,
    prompt: job.prompt,
    duration: String(job.duration),
    mode: "pro",
  };
  const task = job.firstFrame
    ? await runTask("/v1/videos/image2video", { ...common, image: await mediaBase64(job.firstFrame) }, ctx)
    : await runTask("/v1/videos/text2video", { ...common, aspect_ratio: job.aspect }, ctx);
  const url = task.task_result?.videos?.[0]?.url;
  if (!url) throw new ProviderError("kling", "Tarefa concluída sem vídeo.");
  ctx.onStatus?.("Baixando vídeo…");
  return [await saveRemote(url, "video/mp4", { model: job.model.label, prompt: job.prompt })];
}

export async function klingImage(job: ImageJob, ctx: JobContext): Promise<MediaRef[]> {
  const body: Record<string, unknown> = {
    model_name: job.model.apiModel,
    prompt: job.prompt,
    n: job.count,
    aspect_ratio: job.aspect,
  };
  if (job.references[0]) body.image = await mediaBase64(job.references[0]);
  const task = await runTask("/v1/images/generations", body, ctx);
  const urls = task.task_result?.images?.map((i) => i.url) ?? [];
  if (!urls.length) throw new ProviderError("kling", "Tarefa concluída sem imagens.");
  return Promise.all(urls.map((u) => saveRemote(u, "image/png", { model: job.model.label, prompt: job.prompt })));
}
