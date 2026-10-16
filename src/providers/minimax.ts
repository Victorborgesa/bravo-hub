// MiniMax: Hailuo (vídeo), Image-01 e modelos de texto.
import { mediaDataUrl, saveRemote, type MediaRef } from "../lib/media";
import { poll, requestJson, requireSecret } from "./http";
import { ProviderError, type ImageJob, type JobContext, type TextJob, type VideoJob } from "./types";

const BASE = "https://api.minimax.io/v1";

interface BaseResp {
  base_resp?: { status_code: number; status_msg: string };
}

async function call<T extends BaseResp>(path: string, init: RequestInit, ctx: JobContext): Promise<T> {
  const key = await requireSecret("minimax", "minimax");
  const res = await requestJson<T>(
    "minimax",
    `${BASE}${path}`,
    { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } },
    ctx,
  );
  if (res.base_resp && res.base_resp.status_code !== 0) throw new ProviderError("minimax", res.base_resp.status_msg);
  return res;
}

export async function minimaxVideo(job: VideoJob, ctx: JobContext): Promise<MediaRef[]> {
  const body: Record<string, unknown> = {
    model: job.model.apiModel,
    prompt: job.prompt,
    duration: job.duration,
    resolution: job.duration > 6 ? "768P" : "1080P",
  };
  if (job.firstFrame) body.first_frame_image = await mediaDataUrl(job.firstFrame);
  const { task_id } = await call<BaseResp & { task_id: string }>("/video_generation", { method: "POST", body: JSON.stringify(body) }, ctx);

  const fileId = await poll(async () => {
    const s = await call<BaseResp & { status: string; file_id?: string }>(`/query/video_generation?task_id=${task_id}`, { method: "GET" }, ctx);
    if (s.status === "Fail") throw new ProviderError("minimax", "Falha na geração do vídeo");
    return s.status === "Success" && s.file_id ? s.file_id : null;
  }, ctx);

  const file = await call<BaseResp & { file: { download_url: string } }>(`/files/retrieve?file_id=${fileId}`, { method: "GET" }, ctx);
  ctx.onStatus?.("Baixando vídeo…");
  return [await saveRemote(file.file.download_url, "video/mp4", { model: job.model.label, prompt: job.prompt })];
}

export async function minimaxImage(job: ImageJob, ctx: JobContext): Promise<MediaRef[]> {
  const body: Record<string, unknown> = {
    model: job.model.apiModel,
    prompt: job.prompt,
    aspect_ratio: job.aspect,
    n: job.count,
    response_format: "url",
  };
  if (job.references[0]) {
    body.subject_reference = [{ type: "character", image_file: await mediaDataUrl(job.references[0]) }];
  }
  const res = await call<BaseResp & { data?: { image_urls?: string[] } }>("/image_generation", { method: "POST", body: JSON.stringify(body) }, ctx);
  const urls = res.data?.image_urls ?? [];
  if (!urls.length) throw new ProviderError("minimax", "Nenhuma imagem retornada.");
  return Promise.all(urls.map((u) => saveRemote(u, "image/jpeg", { model: job.model.label, prompt: job.prompt })));
}

export async function minimaxText(job: TextJob, ctx: JobContext): Promise<string> {
  const res = await call<BaseResp & { choices?: { message: { content: string } }[] }>(
    "/text/chatcompletion_v2",
    {
      method: "POST",
      body: JSON.stringify({
        model: job.model.apiModel,
        messages: [
          { role: "system", content: job.system },
          { role: "user", content: job.prompt },
        ],
      }),
    },
    ctx,
  );
  // Modelos de raciocínio podem devolver o pensamento entre <think></think>.
  return (res.choices?.[0]?.message.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
