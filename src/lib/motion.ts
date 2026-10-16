// Vocabulário de movimento do Bravo Hub (linha visionOS).
// Tudo que aparece sai de um leve desfoque e cresce um pouco a partir de onde
// nasceu; tudo que some vai mais rápido do que veio. Uma curva, poucos tempos,
// para o app inteiro respirar no mesmo ritmo.

export const EASE = [0.23, 1, 0.32, 1] as const;

/** Mola no estilo Apple: assenta rápido, sem quicar. */
export const SPRING = { type: "spring", duration: 0.45, bounce: 0.12 } as const;
export const SPRING_SNAPPY = { type: "spring", duration: 0.32, bounce: 0.08 } as const;

const blur = (px: number) => `blur(${px}px)`;
// Toda entrada termina em filter: none. Um blur(0) que ficasse aplicado
// transformaria o elemento em "raiz de fundo" e apagaria o vidro dos filhos.

/** Painel flutuante pequeno (popover, menu): ancora no gatilho. */
export const float = {
  initial: { opacity: 0, scale: 0.96, filter: blur(6) },
  animate: { opacity: 1, scale: 1, filter: blur(0), transitionEnd: { filter: "none" }, transition: { duration: 0.22, ease: EASE } },
  exit: { opacity: 0, scale: 0.98, filter: blur(4), transition: { duration: 0.13, ease: EASE } },
};

/** Menu de uso frequente (botão direito, tecla N): quase instantâneo. */
export const quick = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.12, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.08 } },
};

/** Janela central (novo space, confirmações). */
export const sheet = {
  initial: { opacity: 0, scale: 0.94, y: 12, filter: blur(10) },
  animate: { opacity: 1, scale: 1, y: 0, filter: blur(0), transitionEnd: { filter: "none" }, transition: SPRING },
  exit: { opacity: 0, scale: 0.97, y: 6, filter: blur(6), transition: { duration: 0.16, ease: EASE } },
};

/** Véu atrás das janelas. */
export const veil = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.28, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.18, ease: EASE } },
};

/** Painel lateral que entra pela direita (inspector). */
export const drawer = {
  initial: { opacity: 0, x: 28, filter: blur(8) },
  animate: { opacity: 1, x: 0, filter: blur(0), transitionEnd: { filter: "none" }, transition: SPRING },
  exit: { opacity: 0, x: 20, filter: blur(6), transition: { duration: 0.16, ease: EASE } },
};

/** Barra que sobe da base (seleção, execução). */
export const rise = {
  initial: { opacity: 0, y: 18, scale: 0.98, filter: blur(6) },
  animate: { opacity: 1, y: 0, scale: 1, filter: blur(0), transitionEnd: { filter: "none" }, transition: SPRING },
  exit: { opacity: 0, y: 12, filter: blur(4), transition: { duration: 0.15, ease: EASE } },
};

/** Troca de página: a nova surge do desfoque, a antiga se dissolve. */
export const page = {
  initial: { opacity: 0, scale: 0.985, filter: blur(10) },
  animate: { opacity: 1, scale: 1, filter: blur(0), transitionEnd: { filter: "none" }, transition: { duration: 0.42, ease: EASE } },
  exit: { opacity: 0, scale: 1.01, filter: blur(8), transition: { duration: 0.18, ease: EASE } },
};

/** Entrar num space: como se a janela viesse até você. */
export const enterSpace = {
  initial: { opacity: 0, scale: 1.035, filter: blur(14) },
  animate: { opacity: 1, scale: 1, filter: blur(0), transitionEnd: { filter: "none" }, transition: { duration: 0.55, ease: EASE } },
  exit: { opacity: 0, scale: 0.97, filter: blur(10), transition: { duration: 0.22, ease: EASE } },
};

/** Telas cheias que se abrem por cima de tudo (editor, visualizador). */
export const immersive = {
  initial: { opacity: 0, scale: 0.98, filter: blur(12) },
  animate: { opacity: 1, scale: 1, filter: blur(0), transitionEnd: { filter: "none" }, transition: { duration: 0.4, ease: EASE } },
  exit: { opacity: 0, scale: 0.985, filter: blur(8), transition: { duration: 0.2, ease: EASE } },
};

/** Item de lista que entra em cascata (30 a 45 ms entre um e outro). */
export const item = (i: number) => ({
  initial: { opacity: 0, y: 10, filter: blur(6) },
  animate: { opacity: 1, y: 0, filter: blur(0), transitionEnd: { filter: "none" }, transition: { duration: 0.45, ease: EASE, delay: Math.min(i, 12) * 0.04 } },
});

/** Liga o brilho que segue o cursor em cartões de vidro (estilo visionOS). */
export function installPointerGlow() {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  let current: HTMLElement | null = null;
  window.addEventListener(
    "pointermove",
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-glow]") ?? null;
      if (current && current !== el) current.style.removeProperty("--glow-o");
      current = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
      el.style.setProperty("--glow-o", "1");
    },
    { passive: true },
  );
}
