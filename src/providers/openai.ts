// OpenAI: GPT Image e modelos de texto. (A API de vídeo do Sora foi encerrada em 24/09/2026.)
import { mediaBlob, mediaDataUrl, saveBase64, type MediaRef } from "../lib/media";
import { aspectToSize, requestJson, requireSecret } from "./http";
import { ProviderError, type ImageJob, type JobContext, type TextJob } from "./types";

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
