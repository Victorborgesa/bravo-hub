import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Orçamento mensal de IA em dólar, usado no medidor e no painel de custos. */
export const useBudget = create<{ monthly: number; set: (v: number) => void }>()(
  persist((set) => ({ monthly: 0, set: (monthly) => set({ monthly }) }), {
    name: "bravo-budget",
    // Migra o valor que a tela de Custos guardava antes.
    merge: (persisted, current) => {
      const p = persisted as { monthly?: number } | undefined;
      let legacy = 0;
      try {
        legacy = Number(localStorage.getItem("bravo-subscription") ?? 0) || 0;
      } catch {
        legacy = 0;
      }
      return { ...current, monthly: p?.monthly ?? legacy };
    },
  }),
);

export const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

export const daysToRenew = () => {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return Math.ceil((next.getTime() - d.getTime()) / 86400000);
};
