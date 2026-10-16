import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ModelDef } from "../providers/types";
import { uid } from "../lib/media";

export interface CostEntry {
  id: string;
  ts: number;
  modelId: string;
  modelLabel: string;
  provider: string;
  units: number;
  unit: string;
  usd: number;
  ok: boolean;
  spaceId?: string;
  spaceName?: string;
}

interface CostState {
  entries: CostEntry[];
  record: (model: ModelDef, units: number, ok: boolean, space?: { id: string; name: string }) => void;
  clear: () => void;
}

export const useCosts = create<CostState>()(
  persist(
    (set) => ({
      entries: [],
      record: (model, units, ok, space) =>
        set((s) => ({
          entries: [
            {
              id: uid(),
              ts: Date.now(),
              modelId: model.id,
              modelLabel: model.label,
              provider: model.provider,
              units,
              unit: model.price.unit,
              // Falhas não são cobradas pela maioria dos fabricantes; registramos 0.
              usd: ok ? units * model.price.usd : 0,
              ok,
              spaceId: space?.id,
              spaceName: space?.name,
            },
            ...s.entries,
          ].slice(0, 5000),
        })),
      clear: () => set({ entries: [] }),
    }),
    { name: "bravo-costs" },
  ),
);
