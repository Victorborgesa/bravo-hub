// Integrações com o Windows: atualização automática e notificações.
import { isTauri } from "./platform";

export interface AvailableUpdate {
  version: string;
  notes?: string;
  install: (onProgress: (pct: number | null) => void) => Promise<void>;
}

/** Procura uma versão nova publicada nas releases do GitHub. */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauri) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body ?? undefined,
    install: async (onProgress) => {
      let total = 0;
      let done = 0;
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        if (e.event === "Progress") {
          done += e.data.chunkLength;
          onProgress(total ? Math.round((done / total) * 100) : null);
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    },
  };
}

/** Aviso do Windows, usado quando a janela não está em foco. */
export async function notifyDesktop(title: string, body: string) {
  if (!isTauri || document.hasFocus()) return;
  try {
    const n = await import("@tauri-apps/plugin-notification");
    let granted = await n.isPermissionGranted();
    if (!granted) granted = (await n.requestPermission()) === "granted";
    if (granted) n.sendNotification({ title, body });
  } catch {
    // Notificação é um extra; se o sistema recusar, o aviso dentro do app basta.
  }
}
