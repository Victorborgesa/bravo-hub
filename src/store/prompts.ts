import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "../lib/media";

export interface SavedPrompt {
  id: string;
  title: string;
  text: string;
  kind: "image" | "video";
  createdAt: number;
}

const seed = (title: string, kind: SavedPrompt["kind"], text: string): SavedPrompt => ({ id: uid(), title, kind, text, createdAt: 0 });

// Pontos de partida no estilo dos trabalhos da Bravo; dá pra editar e apagar.
const DEFAULTS: SavedPrompt[] = [
  seed("Fachada ao entardecer", "image", "Fotografia arquitetônica de fachada residencial contemporânea ao entardecer, luz dourada rasante, janelas acesas em tom quente, concreto aparente e madeira, paisagismo com gramíneas ornamentais, céu com nuvens suaves, lente 24mm, perspectiva corrigida, hiper-realista"),
  seed("Interior com luz natural", "image", "Interior residencial minimalista com luz natural difusa entrando por janelas amplas, piso de madeira clara, paleta neutra em tons de areia e oliva, mobiliário de design, plantas, sombras suaves, fotografia de interiores editorial, lente 35mm"),
  seed("Área de lazer com piscina", "image", "Área de lazer de condomínio com piscina de borda infinita, deck de madeira, espreguiçadeiras, paisagismo tropical, fim de tarde, reflexos na água, pessoas ao fundo levemente desfocadas, render arquitetônico fotorrealista"),
  seed("Vista aérea do empreendimento", "image", "Vista aérea em drone de empreendimento residencial em contexto urbano, quadras arborizadas, ruas com movimento discreto, luz de manhã cedo, névoa leve no horizonte, masterplan fotorrealista"),
  seed("Planta humanizada", "image", "Planta baixa humanizada vista de cima, mobiliário detalhado, texturas de piso realistas, vegetação, sombras suaves, cores sóbrias, estilo apresentação imobiliária de alto padrão"),
  seed("Aproximação lenta da fachada", "video", "Câmera avança lentamente em direção à fachada em movimento suave de dolly, folhas balançando com o vento, luz do entardecer mudando sutilmente, sem cortes"),
  seed("Órbita ao redor do edifício", "video", "Câmera faz uma órbita lenta de 90 graus ao redor do edifício, altura constante, movimento estável de drone, céu com nuvens passando devagar"),
  seed("Interior com timelapse de luz", "video", "Câmera parada no interior enquanto a luz do sol atravessa o ambiente em timelapse, sombras se movendo pelo piso, cortinas leves balançando"),
];

interface PromptState {
  prompts: SavedPrompt[];
  add: (p: Omit<SavedPrompt, "id" | "createdAt">) => void;
  remove: (id: string) => void;
}

export const usePrompts = create<PromptState>()(
  persist(
    (set) => ({
      prompts: DEFAULTS,
      add: (p) => set((s) => ({ prompts: [{ ...p, id: uid(), createdAt: Date.now() }, ...s.prompts] })),
      remove: (id) => set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) })),
    }),
    { name: "bravo-prompts" },
  ),
);
