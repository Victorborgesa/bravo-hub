import { create } from "zustand";
import { checkForUpdate, type AvailableUpdate } from "../lib/system";
import { isTauri } from "../lib/platform";

type Status = "idle" | "checking" | "latest" | "available" | "installing" | "error";

/** Estado da atualização, compartilhado pelo aviso no canto e pela tela de Ajustes. */
interface UpdateState {
  status: Status;
  update: AvailableUpdate | null;
  progress: number | null;
  error?: string;
  checkedAt?: number;
  check: () => Promise<void>;
  install: () => Promise<void>;
}

export const useUpdates = create<UpdateState>()((set, get) => ({
  status: "idle",
  update: null,
  progress: null,
  check: async () => {
    if (!isTauri || get().status === "checking" || get().status === "installing") return;
    set({ status: "checking", error: undefined });
    try {
      const update = await checkForUpdate();
      set({ update, status: update ? "available" : "latest", checkedAt: Date.now() });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e), checkedAt: Date.now() });
    }
  },
  install: async () => {
    const { update } = get();
    if (!update) return;
    set({ status: "installing", progress: null });
    try {
      await update.install((progress) => set({ progress }));
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
