import { create } from "zustand";
import type { MediaRef } from "../lib/media";

/** Editor aberto: a imagem a editar e o node de onde ela veio (se houver). */
interface EditorState {
  target: { media: MediaRef; nodeId?: string } | null;
  openEditor: (media: MediaRef, nodeId?: string) => void;
  close: () => void;
}

export const useEditor = create<EditorState>()((set) => ({
  target: null,
  openEditor: (media, nodeId) => set({ target: { media, nodeId } }),
  close: () => set({ target: null }),
}));
