// Acerto de tom: a IA às vezes devolve a cena um pouco mais clara, mais
// quente ou mais contrastada do que o render. Comparando o entorno da área
// (que deveria ter ficado igual) dá para medir esse desvio e desfazer no que
// for colado, para a pessoa nova ficar com a mesma luz do resto.

export interface Tone {
  r: number;
  g: number;
  b: number;
}

const NEUTRAL: Tone = { r: 1, g: 1, b: 1 };

function data(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}

/**
 * Ganho por canal que leva o resultado de volta ao tom do original, medido
 * num anel em volta da área (box em frações; exclude = área editada com folga).
 */
export function measureTone(
  original: CanvasImageSource,
  result: CanvasImageSource,
  exclude: CanvasImageSource,
  box: { x: number; y: number; w: number; h: number },
  size: { w: number; h: number; ew: number; eh: number },
): Tone {
  const bx = Math.max(0, box.x - box.w), by = Math.max(0, box.y - box.h);
  const bw = Math.min(1, box.x + box.w * 2) - bx, bh = Math.min(1, box.y + box.h * 2) - by;
  const W = 200, H = Math.max(20, Math.round((W * bh * size.h) / (bw * size.w)));
  const a = data(original, bx * size.w, by * size.h, bw * size.w, bh * size.h, W, H);
  const b = data(result, bx * size.w, by * size.h, bw * size.w, bh * size.h, W, H);
  const e = data(exclude, bx * size.ew, by * size.eh, bw * size.ew, bh * size.eh, W, H);
  const sa = [0, 0, 0], sb = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (e[i + 3] > 12 || b[i + 3] < 250) continue;
    // Ignora estouros e pretos puros: não dizem nada sobre o tom.
    const la = (a[i] + a[i + 1] + a[i + 2]) / 3;
    if (la < 8 || la > 247) continue;
    for (let k = 0; k < 3; k++) {
      sa[k] += a[i + k];
      sb[k] += b[i + k];
    }
    n++;
  }
  if (n < 200) return NEUTRAL;
  const gain = (k: number) => Math.min(1.25, Math.max(0.8, sa[k] / Math.max(1, sb[k])));
  return { r: gain(0), g: gain(1), b: gain(2) };
}

export const isNeutral = (t: Tone) => [t.r, t.g, t.b].every((v) => Math.abs(v - 1) < 0.02);

/** Aplica o ganho na imagem inteira (cópia). */
export function applyTone(src: CanvasImageSource, w: number, h: number, t: Tone): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, d[i] * t.r);
    d[i + 1] = Math.min(255, d[i + 1] * t.g);
    d[i + 2] = Math.min(255, d[i + 2] * t.b);
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function describeTone(t: Tone): string {
  if (isNeutral(t)) return "";
  const lum = (0.2126 * t.r + 0.7152 * t.g + 0.0722 * t.b - 1) * 100;
  return `luz ${lum >= 0 ? "+" : ""}${lum.toFixed(0)}%`;
}
