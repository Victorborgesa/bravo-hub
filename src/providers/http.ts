import { httpFetch, secretGet } from "../lib/platform";
import { ProviderError, type JobContext, type ProviderId } from "./types";

export async function requireSecret(provider: ProviderId, key: string): Promise<string> {
  const value = await secretGet(key);
  if (!value) throw new ProviderError(provider, "Chave de API não configurada. Abra Ajustes para adicionar.");
  return value;
}

export async function requestJson<T>(
  provider: ProviderId,
  url: string,
  init: RequestInit,
  ctx?: JobContext,
): Promise<T> {
  const res = await httpFetch(url, { ...init, signal: ctx?.signal });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new ProviderError(provider, `${res.status}: ${describeError(body) ?? res.statusText}`);
  }
  return body as T;
}

function describeError(body: unknown): string | null {
  if (!body) return null;
  if (typeof body === "string") return body.slice(0, 300);
  const b = body as Record<string, any>;
  return (
    b.error?.message ??
    b.message ??
    b.detail ??
    b.base_resp?.status_msg ??
    JSON.stringify(body).slice(0, 300)
  );
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Cancelado", "AbortError"));
    });
  });

/**
 * Consulta um job assíncrono até ele terminar. `check` devolve o resultado
 * quando pronto, ou null para continuar esperando.
 */
export async function poll<T>(
  check: () => Promise<T | null>,
  ctx?: JobContext,
  { interval = 5000, timeout = 20 * 60_000 } = {},
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const result = await check();
    if (result !== null) return result;
    if (Date.now() - start > timeout) throw new Error("Tempo esgotado esperando o resultado");
    const secs = Math.round((Date.now() - start) / 1000);
    ctx?.onStatus?.(`Processando… ${secs}s`);
    await sleep(interval, ctx?.signal);
  }
}

/** Converte "16:9" no tamanho mais próximo aceito por APIs que pedem pixels. */
export function aspectToSize(aspect: string, options: string[]): string {
  const [w, h] = aspect.split(":").map(Number);
  const target = w / h;
  let best = options[0];
  let bestDiff = Infinity;
  for (const opt of options) {
    const [ow, oh] = opt.split("x").map(Number);
    const diff = Math.abs(ow / oh - target);
    if (diff < bestDiff) {
      best = opt;
      bestDiff = diff;
    }
  }
  return best;
}
