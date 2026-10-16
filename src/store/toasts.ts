import { create } from "zustand";
import { uid } from "../lib/media";

export interface Toast {
  id: string;
  message: string;
  tone: "ok" | "error" | "info";
}

interface ToastState {
  toasts: Toast[];
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function notify(message: string, tone: Toast["tone"] = "info") {
  const id = uid();
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, message, tone }].slice(-4) }));
  setTimeout(() => useToasts.getState().dismiss(id), tone === "error" ? 8000 : 4000);
}
