import type { MediaRef } from "../lib/media";
import { googleImage, googleText, googleVideo } from "./google";
import { openaiImage, openaiText } from "./openai";
import { seedanceVideo, seedreamImage } from "./bytedance";
import { klingImage, klingVideo } from "./kling";
import { minimaxImage, minimaxText, minimaxVideo } from "./minimax";
import { clarityUpscale } from "./replicate";
import { ProviderError, type ImageJob, type JobContext, type TextJob, type UpscaleJob, type VideoJob } from "./types";

export function generateImages(job: ImageJob, ctx: JobContext): Promise<MediaRef[]> {
  switch (job.model.provider) {
    case "google": return googleImage(job, ctx);
    case "openai": return openaiImage(job, ctx);
    case "bytedance": return seedreamImage(job, ctx);
    case "kling": return klingImage(job, ctx);
    case "minimax": return minimaxImage(job, ctx);
    default: throw new ProviderError(job.model.provider, "Este fabricante não gera imagens.");
  }
}

export function generateVideo(job: VideoJob, ctx: JobContext): Promise<MediaRef[]> {
  switch (job.model.provider) {
    case "google": return googleVideo(job, ctx);
    case "bytedance": return seedanceVideo(job, ctx);
    case "kling": return klingVideo(job, ctx);
    case "minimax": return minimaxVideo(job, ctx);
    default: throw new ProviderError(job.model.provider, "Este fabricante não gera vídeos.");
  }
}

export function generateText(job: TextJob, ctx: JobContext): Promise<string> {
  switch (job.model.provider) {
    case "google": return googleText(job, ctx);
    case "openai": return openaiText(job, ctx);
    case "minimax": return minimaxText(job, ctx);
    default: throw new ProviderError(job.model.provider, "Este fabricante não gera texto.");
  }
}

export const upscale = (job: UpscaleJob, ctx: JobContext) => clarityUpscale(job, ctx);
