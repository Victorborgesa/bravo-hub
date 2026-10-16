import { httpFetch, readStoredBytes, storeBytes } from "./platform";

export type MediaKind = "image" | "video";

export interface MediaRef {
  id: string;
  kind: MediaKind;
  url: string;
  path?: string;
  mime: string;
  createdAt: number;
  model?: string;
  prompt?: string;
}

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

interface Meta {
  model?: string;
  prompt?: string;
}

export async function saveBytes(bytes: Uint8Array, mime: string, meta: Meta = {}): Promise<MediaRef> {
  const id = uid();
  const kind: MediaKind = mime.startsWith("video") ? "video" : "image";
  const stored = await storeBytes(bytes, `${id}.${EXT[mime] ?? "bin"}`, mime);
  return { id, kind, mime, createdAt: Date.now(), ...stored, ...meta };
}

export const saveBase64 = (b64: string, mime: string, meta?: Meta) =>
  saveBytes(base64ToBytes(b64), mime, meta);

/** Baixa um resultado remoto na hora, porque as URLs dos provedores expiram. */
export async function saveRemote(
  url: string,
  fallbackMime: string,
  meta?: Meta,
  headers?: Record<string, string>,
): Promise<MediaRef> {
  const res = await httpFetch(url, { headers });
  if (!res.ok) throw new Error(`Falha ao baixar o resultado (${res.status})`);
  const mime = res.headers.get("content-type")?.split(";")[0] || fallbackMime;
  return saveBytes(new Uint8Array(await res.arrayBuffer()), mime, meta);
}

export async function mediaBase64(ref: MediaRef): Promise<string> {
  return bytesToBase64(await readStoredBytes(ref));
}

export async function mediaDataUrl(ref: MediaRef): Promise<string> {
  return `data:${ref.mime};base64,${await mediaBase64(ref)}`;
}

export async function mediaBlob(ref: MediaRef): Promise<Blob> {
  return new Blob([(await readStoredBytes(ref)) as BlobPart], { type: ref.mime });
}

export function mediaFileName(ref: MediaRef): string {
  return `bravo-${ref.id}.${EXT[ref.mime] ?? "bin"}`;
}
