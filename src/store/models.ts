import { create } from "zustand";
import { persist } from "zustand/middleware";

// IDs de API editados pelo usuário em Ajustes. Quando um fabricante renomeia
// ou aposenta um modelo, dá pra corrigir sem esperar uma nova versão do app.
interface ModelOverrides {
  apiIds: Record<string, string>;
  setApiId: (modelId: string, apiId: string) => void;
  reset: (modelId: string) => void;
}

export const useModelOverrides = create<ModelOverrides>()(
  persist(
    (set) => ({
      apiIds: {},
      setApiId: (modelId, apiId) => set((s) => ({ apiIds: { ...s.apiIds, [modelId]: apiId } })),
      reset: (modelId) =>
        set((s) => {
          const { [modelId]: _removed, ...rest } = s.apiIds;
          return { apiIds: rest };
        }),
    }),
    { name: "bravo-model-overrides" },
  ),
);
