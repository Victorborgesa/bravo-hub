// Google Gemini API: Nano Banana (Gemini Image), Imagen, Veo e Gemini texto.
import { mediaBase64, saveBase64, saveRemote, type MediaRef } from "../lib/media";
import { poll, requestJson, requireSecret } from "./http";
import { ProviderError, type ImageJob, type JobContext, type TextJob, type VideoJob } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

async function headers() {
  return { "x-goog-api-key": await requireSecret("google", "google"), "Content-Type": "application/json" };
}

async function inlineParts(refs: MediaRef[]) {
  return Promise.all(
    refs.map(async (r) => ({ inline_data: { mime_type: r.mime, data: await mediaBase64(r) } })),
  );
}

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string; inlineData?: { mimeType: string; data: string } }[] } }[];
}

export async function googleImage(job: ImageJob, ctx: JobContext): Promise<MediaRef[]> {
  const h = await headers();
  if (job.model.apiModel.startsWith("imagen")) {
    const res = await requestJson<{ predictions?: { bytesBase64Encoded: string; mimeType: string }[] }>(
      "google",
      `${BASE}/models/${job.model.apiModel}:predict`,
      {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          instances: [{ prompt: job.prompt }],
          parameters: { sampleCount: job.count, aspectRatio: job.aspect },
        }),
      },
      ctx,
    );
    const preds = res.predictions ?? [];
    if (!preds.length) throw new ProviderError("google", "O Imagen não devolveu imagens (possível filtro de segurança).");
    return Promise.all(preds.map((p) => saveBase64(p.bytesBase64Encoded, p.mimeType, { model: job.model.label, prompt: job.prompt })));
  }

  // Gemini Image (Nano Banana) gera uma imagem por chamada.
  const parts = [{ text: job.prompt }, ...(await inlineParts(job.references))];
  const out: MediaRef[] = [];
  for (let i = 0; i < job.count; i++) {
    ctx.onStatus?.(job.count > 1 ? `Gerando ${i + 1} de ${job.count}…` : "Gerando…");
    const res = await requestJson<GenerateContentResponse>(
      "google",
      `${BASE}/models/${job.model.apiModel}:generateContent`,
      {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: job.aspect } },
        }),
      },
      ctx,
    );
    const img = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!img) throw new ProviderError("google", "O modelo não devolveu imagem (possível filtro de segurança).");
    out.push(await saveBase64(img.data, img.mimeType, { model: job.model.label, prompt: job.prompt }));
  }
  return out;
}

interface Operation {
  name: string;
  done?: boolean;
  error?: { message: string };
  response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri: string } }[] } };
}

export async function googleVideo(job: VideoJob, ctx: JobContext): Promise<MediaRef[]> {
  const h = await headers();
  const instance: Record<string, unknown> = { prompt: job.prompt };
  if (job.firstFrame) {
    instance.image = { bytesBase64Encoded: await mediaBase64(job.firstFrame), mimeType: job.firstFrame.mime };
  }
  const op = await requestJson<Operation>(
    "google",
    `${BASE}/models/${job.model.apiModel}:predictLongRunning`,
    {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        instances: [instance],
        parameters: { aspectRatio: job.aspect, durationSeconds: job.duration },
      }),
    },
    ctx,
  );
  const done = await poll(async () => {
    const cur = await requestJson<Operation>("google", `${BASE}/${op.name}`, { headers: h }, ctx);
    if (cur.error) throw new ProviderError("google", cur.error.message);
    return cur.done ? cur : null;
  }, ctx, { interval: 8000 });
  const uri = done.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new ProviderError("google", "O Veo terminou sem vídeo (possível filtro de segurança).");
  ctx.onStatus?.("Baixando vídeo…");
  return [await saveRemote(uri, "video/mp4", { model: job.model.label, prompt: job.prompt }, { "x-goog-api-key": h["x-goog-api-key"] })];
}

export async function googleText(job: TextJob, ctx: JobContext): Promise<string> {
  const h = await headers();
  const base = {
    systemInstruction: { parts: [{ text: job.system }] },
    contents: [{ role: "user", parts: [{ text: job.prompt }, ...(await inlineParts(job.images))] }],
  };
  const call = (body: object) =>
    requestJson<GenerateContentResponse>("google", `${BASE}/models/${job.model.apiModel}:generateContent`, { method: "POST", headers: h, body: JSON.stringify(body) }, ctx);
  let res: GenerateContentResponse;
  try {
    // Raciocínio curto: a tarefa é escrever um texto, não resolver um problema.
    res = await call(job.fast ? { ...base, generationConfig: { thinkingConfig: { thinkingLevel: "low" } } } : base);
  } catch (e) {
    // Modelos que não conhecem o ajuste recusam com 400: vai sem ele.
    if (!job.fast || !(e instanceof ProviderError) || !e.message.startsWith("400")) throw e;
    res = await call(base);
  }
  return res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
}
