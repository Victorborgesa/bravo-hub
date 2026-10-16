// MiniMax: H3/Hailuo 3 (vídeo), Image-01 e modelos de texto.
import { mediaDataUrl, saveRemote, type MediaRef } from "../lib/media";
import { poll, requestJson, requireSecret } from "./http";
import { ProviderError, type ImageJob, type JobContext, type TextJob, type VideoJob } from "./types";

const BASE = "https://api.minimax.io";

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

// Respostas do H3 variam entre a API v1 (status "Success" + file_id) e a v2
// (task.status "succeeded" + URL do vídeo). Aceitamos os dois formatos.
interface VideoStatus extends BaseResp {
  status?: string;
  file_id?: string;
  video_url?: string;
  content?: { url?: string; video_url?: string };
  task?: { status?: string; content?: { url?: string; video_url?: string }; error?: { message?: string } };
}

const FAILED = /^(fail|failed|cancel)/i;
const DONE = /^(success|succeeded)$/i;

export async function minimaxVideo(job: VideoJob, ctx: JobContext): Promise<MediaRef[]> {
  const content: Record<string, unknown>[] = [{ type: "text", text: job.prompt }];
  if (job.firstFrame) {
    content.push({ type: "image_url", image_url: { url: await mediaDataUrl(job.firstFrame) }, role: "first_frame" });
  }
  const created = await call<BaseResp & { task_id?: string; id?: string; task?: { id: string } }>(
    "/v2/video_generation",
    {
      method: "POST",
      body: JSON.stringify({
        model: job.model.apiModel,
        content,
        duration: job.duration,
        resolution: job.model.resolution ?? "768P",
      }),
    },
    ctx,
  );
  const taskId = created.task_id ?? created.task?.id ?? created.id;
  if (!taskId) throw new ProviderError("minimax", "A API não devolveu o ID da tarefa.");

  const result = await poll(async () => {
    const s = await call<VideoStatus>(`/v1/query/video_generation?task_id=${taskId}`, { method: "GET" }, ctx);
    const status = s.task?.status ?? s.status ?? "";
    if (FAILED.test(status)) throw new ProviderError("minimax", s.task?.error?.message ?? "Falha na geração do vídeo");
    if (!DONE.test(status)) return null;
    return s;
  }, ctx);

  let url = result.task?.content?.url ?? result.task?.content?.video_url ?? result.content?.url ?? result.content?.video_url ?? result.video_url;
  if (!url && result.file_id) {
    const file = await call<BaseResp & { file: { download_url: string } }>(`/v1/files/retrieve?file_id=${result.file_id}`, { method: "GET" }, ctx);
    url = file.file.download_url;
  }
  if (!url) throw new ProviderError("minimax", "Tarefa concluída sem vídeo.");
  ctx.onStatus?.("Baixando vídeo…");
  return [await saveRemote(url, "video/mp4", { model: job.model.label, prompt: job.prompt })];
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
  const res = await call<BaseResp & { data?: { image_urls?: string[] } }>("/v1/image_generation", { method: "POST", body: JSON.stringify(body) }, ctx);
  const urls = res.data?.image_urls ?? [];
  if (!urls.length) throw new ProviderError("minimax", "Nenhuma imagem retornada.");
  return Promise.all(urls.map((u) => saveRemote(u, "image/jpeg", { model: job.model.label, prompt: job.prompt })));
}

export async function minimaxText(job: TextJob, ctx: JobContext): Promise<string> {
  const res = await call<BaseResp & { choices?: { message: { content: string } }[] }>(
    "/v1/text/chatcompletion_v2",
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
