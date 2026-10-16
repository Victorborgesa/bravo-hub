// Alinhamento do resultado com a cena original. Os geradores às vezes
// devolvem a cena levemente reenquadrada (um pouco maior, um pouco para o
// lado). Colado sem alinhar, o que foi adicionado "flutua": a pessoa senta
// no ar na frente da borda. Aqui a gente acha a escala e o deslocamento que
// encaixam as bordas do resultado nas do original, olhando só para fora da
// área editada, e corrige antes de colar.

/** Escala e deslocamento (em fração da largura/altura) a aplicar no resultado. */
export interface Warp {
  s: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Warp = { s: 1, tx: 0, ty: 0 };
export const isIdentity = (w: Warp) => w.s === 1 && w.tx === 0 && w.ty === 0;

function pixels(src: CanvasImageSource, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}

/**
 * Bordas (gradiente) mais a luminância suavizada. As bordas resistem a troca
 * de cor; a luminância desempata padrões repetidos, como pastilha e piso.
 */
function features(src: CanvasImageSource, w: number, h: number) {
  const d = pixels(src, w, h);
  const l = new Float32Array(w * h);
  for (let i = 0, j = 0; j < l.length; i += 4, j++) l[j] = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
  const e = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      e[i] = Math.abs(l[i + 1] - l[i - 1]) + Math.abs(l[i + w] - l[i - w]);
    }
  }
  // Luminância sem o brilho médio, para não penalizar uma mudança geral de luz.
  let mean = 0;
  for (let i = 0; i < l.length; i++) mean += l[i];
  mean /= l.length;
  for (let i = 0; i < l.length; i++) l[i] -= mean;
  return { e, l };
}

type Feat = ReturnType<typeof features>;

function cost(a: Feat, b: Feat, valid: Uint8Array, w: number, h: number, s: number, tx: number, ty: number) {
  let sum = 0, n = 0;
  for (let y = 2; y < h - 2; y += 1) {
    const v = Math.round((y - ty) / s);
    if (v < 1 || v >= h - 1) continue;
    for (let x = 2; x < w - 2; x += 1) {
      const i = y * w + x;
      if (!valid[i]) continue;
      const u = Math.round((x - tx) / s);
      if (u < 1 || u >= w - 1) continue;
      const j = v * w + u;
      sum += Math.abs(a.e[i] - b.e[j]) + 0.6 * Math.abs(a.l[i] - b.l[j]);
      n++;
    }
  }
  return n > 0 ? { c: sum / n, n } : { c: Infinity, n: 0 };
}

function search(original: CanvasImageSource, result: CanvasImageSource, exclude: CanvasImageSource, w: number, h: number, scales: number[], shifts: number[], center: Warp) {
  const a = features(original, w, h);
  const b = features(result, w, h);
  const ex = pixels(exclude, w, h);
  const valid = new Uint8Array(w * h);
  let total = 0;
  for (let i = 0, j = 0; j < valid.length; i += 4, j++) {
    valid[j] = ex[i + 3] < 12 ? 1 : 0;
    total += valid[j];
  }
  const base = cost(a, b, valid, w, h, 1, 0, 0);
  let best = { ...center, c: cost(a, b, valid, w, h, center.s, center.tx * w, center.ty * h).c };
  for (const ds of scales) {
    const s = center.s + ds;
    for (const dy of shifts) {
      for (const dx of shifts) {
        const tx = center.tx * w + dx, ty = center.ty * h + dy;
        const r = cost(a, b, valid, w, h, s, tx, ty);
        if (r.n < total * 0.4) continue;
        // Em caso de quase empate, fica o menor deslocamento (o mais provável).
        const c = r.c * (1 + 0.004 * (Math.abs(tx) + Math.abs(ty)) * (96 / w) + 0.6 * Math.abs(s - 1));
        if (c < best.c) best = { s, tx: tx / w, ty: ty / h, c };
      }
    }
  }
  return { best, base: base.c };
}

/**
 * Procura o encaixe em duas passadas (grossa e fina). `exclude` é a área
 * editada (alfa > 0), que não entra na comparação.
 */
export function estimateWarp(original: CanvasImageSource, result: CanvasImageSource, exclude: CanvasImageSource, aspect: number): Warp {
  const coarseW = 128, coarseH = Math.max(24, Math.round(coarseW / aspect));
  const range = (n: number, step: number) => Array.from({ length: 2 * n + 1 }, (_, i) => (i - n) * step);
  const coarse = search(original, result, exclude, coarseW, coarseH, range(6, 0.01), range(8, 1), IDENTITY);
  const fineW = 256, fineH = Math.max(48, Math.round(fineW / aspect));
  const fine = search(original, result, exclude, fineW, fineH, range(2, 0.0025), range(3, 1), coarse.best);
  // Só corrige quando o encaixe melhora de verdade; senão fica como veio.
  if (!(fine.best.c < fine.base * 0.92)) return IDENTITY;
  if (Math.abs(fine.best.s - 1) < 0.002 && Math.abs(fine.best.tx) * fineW < 0.5 && Math.abs(fine.best.ty) * fineH < 0.5) return IDENTITY;
  return { s: fine.best.s, tx: fine.best.tx, ty: fine.best.ty };
}

/** Redesenha uma imagem (ou máscara) já no lugar certo, no tamanho pedido. */
export function applyWarp(src: CanvasImageSource, w: number, h: number, warp: Warp): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, warp.tx * w, warp.ty * h, w * warp.s, h * warp.s);
  return c;
}

/** Aplica `a` e depois `b` (ambos em frações da cena enviada). */
export function chain(a: Warp, b: Warp): Warp {
  return { s: a.s * b.s, tx: b.tx + b.s * a.tx, ty: b.ty + b.s * a.ty };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Ajuste fino só em volta da edição. A IA às vezes mantém o quadro geral e
 * escorrega a geometria num trecho (a borda da piscina desce alguns pixels
 * justamente onde ela sentou as pessoas). Aqui a comparação usa um anel ao
 * redor da área marcada, em resolução maior, e devolve a correção já em
 * coordenadas da cena inteira.
 *
 * @param original recorte da cena original (qualquer tamanho)
 * @param result resultado já com o ajuste global
 * @param exclude área editada com folga (alfa), no mesmo enquadramento
 * @param box área marcada, em frações da cena enviada
 */
export function refineLocal(original: CanvasImageSource, result: CanvasImageSource, exclude: CanvasImageSource, box: Box, sizes: { ow: number; oh: number; rw: number; rh: number; ew: number; eh: number }): Warp {
  // Vizinhança: a área marcada mais 70% de cada lado.
  const bx = Math.max(0, box.x - box.w * 0.7), by = Math.max(0, box.y - box.h * 0.7);
  const bw = Math.min(1, box.x + box.w * 1.7) - bx, bh = Math.min(1, box.y + box.h * 1.7) - by;
  if (bw <= 0 || bh <= 0) return IDENTITY;
  const lw = 320, lh = Math.max(40, Math.round((lw * bh * sizes.oh) / (bw * sizes.ow)));
  const crop = (src: CanvasImageSource, sw: number, sh: number) => {
    const c = document.createElement("canvas");
    c.width = lw;
    c.height = lh;
    const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    g.drawImage(src, bx * sw, by * sh, bw * sw, bh * sh, 0, 0, lw, lh);
    return c;
  };
  const local = estimateWarp(crop(original, sizes.ow, sizes.oh), crop(result, sizes.rw, sizes.rh), crop(exclude, sizes.ew, sizes.eh), lw / lh);
  if (isIdentity(local)) return IDENTITY;
  // Traz a correção do recorte local para a cena inteira.
  return { s: local.s, tx: bx * (1 - local.s) + bw * local.tx, ty: by * (1 - local.s) + bh * local.ty };
}

/** Resumo legível do ajuste, para a linha de tempos. */
export function describeWarp(w: Warp, width: number, height: number): string {
  if (isIdentity(w)) return "sem ajuste";
  const pct = (w.s - 1) * 100;
  const dx = Math.round(w.tx * width), dy = Math.round(w.ty * height);
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% · ${dx}px ↔ · ${dy}px ↕`;
}
