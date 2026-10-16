// Ponte entre o app e o sistema. Dentro do Tauri usa recursos nativos (cofre do
// sistema, disco, HTTP sem CORS); no navegador de desenvolvimento cai em
// alternativas simples para a interface continuar utilizável.
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { mkdir, writeFile, readFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { appLocalDataDir, join, downloadDir } from "@tauri-apps/api/path";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const httpFetch: typeof fetch = (input, init) =>
  isTauri ? tauriFetch(input as string, init) : fetch(input, init);

const DEV_SECRET_PREFIX = "bravo-dev-secret:";

export async function secretGet(name: string): Promise<string | null> {
  if (isTauri) return (await invoke<string | null>("secret_get", { name })) ?? null;
  return localStorage.getItem(DEV_SECRET_PREFIX + name);
}

export async function secretSet(name: string, value: string): Promise<void> {
  if (isTauri) return invoke("secret_set", { name, value });
  localStorage.setItem(DEV_SECRET_PREFIX + name, value);
}

export async function secretDelete(name: string): Promise<void> {
  if (isTauri) return invoke("secret_delete", { name });
  localStorage.removeItem(DEV_SECRET_PREFIX + name);
}

export interface StoredFile {
  url: string;
  /** Caminho relativo à pasta de dados do app (ex.: media/abc.png). */
  path?: string;
}

/** Guarda bytes gerados no disco do app e devolve uma URL exibível. */
export async function storeBytes(bytes: Uint8Array, fileName: string, mime: string): Promise<StoredFile> {
  if (!isTauri) {
    return { url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime })) };
  }
  const rel = `media/${fileName}`;
  await mkdir("media", { baseDir: BaseDirectory.AppLocalData, recursive: true });
  await writeFile(rel, bytes, { baseDir: BaseDirectory.AppLocalData });
  const absolute = await join(await appLocalDataDir(), "media", fileName);
  return { url: convertFileSrc(absolute), path: rel };
}

export async function readStoredBytes(file: StoredFile): Promise<Uint8Array> {
  if (isTauri && file.path) {
    return readFile(file.path, { baseDir: BaseDirectory.AppLocalData });
  }
  const res = await fetch(file.url);
  return new Uint8Array(await res.arrayBuffer());
}

/** Exporta um arquivo para a pasta Downloads/Bravo Hub. */
export async function exportToDownloads(file: StoredFile, fileName: string): Promise<string> {
  const bytes = await readStoredBytes(file);
  if (!isTauri) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes as BlobPart]));
    a.download = fileName;
    a.click();
    return fileName;
  }
  const dir = await join(await downloadDir(), "Bravo Hub");
  await mkdir(dir, { recursive: true });
  const target = await join(dir, fileName);
  await writeFile(target, bytes);
  return target;
}
