// Arquivos de mídia que nenhum space usa mais (nodes apagados, spaces excluídos).
import { BaseDirectory, readDir, remove, stat } from "@tauri-apps/plugin-fs";
import { isTauri } from "./platform";
import { useSpaces } from "../store/spaces";

export interface MediaUsage {
  files: number;
  bytes: number;
  orphanFiles: string[];
  orphanBytes: number;
}

function referencedPaths(): Set<string> {
  const used = new Set<string>();
  for (const space of useSpaces.getState().spaces) {
    for (const n of space.nodes) {
      const d = n.data;
      for (const m of [...(d.gallery ?? []), ...(d.outputs?.images ?? []), ...(d.outputs?.videos ?? [])]) {
        if (m.path) used.add(m.path);
      }
    }
  }
  return used;
}

export async function scanMedia(): Promise<MediaUsage | null> {
  if (!isTauri) return null;
  const used = referencedPaths();
  const usage: MediaUsage = { files: 0, bytes: 0, orphanFiles: [], orphanBytes: 0 };
  let entries;
  try {
    entries = await readDir("media", { baseDir: BaseDirectory.AppLocalData });
  } catch {
    return usage; // pasta ainda não existe
  }
  for (const entry of entries) {
    if (!entry.isFile) continue;
    const rel = `media/${entry.name}`;
    const size = (await stat(rel, { baseDir: BaseDirectory.AppLocalData })).size;
    usage.files++;
    usage.bytes += size;
    if (!used.has(rel)) {
      usage.orphanFiles.push(rel);
      usage.orphanBytes += size;
    }
  }
  return usage;
}

export async function deleteMedia(paths: string[]) {
  // Confere de novo na hora de apagar, caso algo tenha sido usado nesse meio tempo.
  const used = referencedPaths();
  for (const p of paths) if (!used.has(p)) await remove(p, { baseDir: BaseDirectory.AppLocalData });
}

export const formatBytes = (b: number) =>
  b < 1024 ** 2 ? `${(b / 1024).toFixed(0)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`;
