// Recorte preciso do que a IA adicionou. O SAM 3 encontra cada pessoa (ou o
// objeto pedido) separadamente; a gente fica só com as que são novas e estão
// na área marcada, cola o contorno nas bordas reais da imagem e leva a sombra
// de contato junto.
import { httpFetch } from "../lib/platform";
import { replicateRun } from "../providers/replicate";
import type { JobContext } from "../providers/types";
import { SAM3_VERSION, SEGMENT_VERSION, translateObject } from "./engines";
import { readZip } from "./zip";

/** Máscara em ponto flutuante (0 a 1), linha a linha. */
export interface Plane {
  w: number;
  h: number;
  v: Float32Array;
}

const plane = (w: number, h: number): Plane => ({ w, h, v: new Float32Array(w * h) });

function draw(src: CanvasImageSource, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}

/** Luminância (0 a 1) de uma imagem no tamanho de trabalho. */
export function luma(src: CanvasImageSource, w: number, h: number): Plane {
  const d = draw(src, w, h);
  const p = plane(w, h);
  for (let i = 0, j = 0; j < p.v.length; i += 4, j++) p.v[j] = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
  return p;
}

/** Máscara (branco = objeto) lida de uma imagem, considerando o alfa. */
export function maskPlane(src: CanvasImageSource, w: number, h: number): Plane {
  const d = draw(src, w, h);
  const p = plane(w, h);
  for (let i = 0, j = 0; j < p.v.length; i += 4, j++) p.v[j] = (((d[i] + d[i + 1] + d[i + 2]) / 765) * d[i + 3]) / 255;
  return p;
}

/**
 * Quanto o resultado puxou para o vermelho em relação ao original (0 a 1).
 * Serve para barrar marcações que a IA tenha copiado para a cena.
 */
export function redShift(a: CanvasImageSource, b: CanvasImageSource, w: number, h: number): Plane {
  const da = draw(a, w, h);
  const db = draw(b, w, h);
  const p = plane(w, h);
  for (let i = 0, j = 0; j < p.v.length; i += 4, j++) {
    const ra = da[i] - (da[i + 1] + da[i + 2]) / 2;
    const rb = db[i] - (db[i + 1] + db[i + 2]) / 2;
    // Só vermelho de marcação (bem mais forte que verde e azul); pele, madeira
    // e luz quente também puxam para o vermelho, mas bem menos.
    const marking = db[i] > 1.6 * Math.max(db[i + 1], db[i + 2], 1);
    p.v[j] = marking ? Math.max(0, (rb - ra) / 255) : 0;
  }
  return p;
}

/** Só o canal alfa (a seleção pintada no editor). */
export function alphaPlane(src: CanvasImageSource, w: number, h: number): Plane {
  const d = draw(src, w, h);
  const p = plane(w, h);
  for (let i = 3, j = 0; j < p.v.length; i += 4, j++) p.v[j] = d[i] / 255;
  return p;
}

/** Diferença de cor entre o original e o resultado (0 = igual). */
export function difference(a: CanvasImageSource, b: CanvasImageSource, w: number, h: number): Plane {
  const da = draw(a, w, h);
  const db = draw(b, w, h);
  const p = plane(w, h);
  for (let i = 0, j = 0; j < p.v.length; i += 4, j++) {
    const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    p.v[j] = Math.min(1, Math.max(0, (d - 30) / 120));
  }
  return p;
}

// ---------------------------------------------------------------------------
// Filtros

/** Média numa janela quadrada de raio r, via imagem integral. */
function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      const s = sat[(y1 + 1) * (w + 1) + x1 + 1] - sat[y0 * (w + 1) + x1 + 1] - sat[(y1 + 1) * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
      out[y * w + x] = s / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
  }
  return out;
}

export const blur = (p: Plane, r: number): Plane => ({ ...p, v: r > 0 ? boxMean(boxMean(p.v, p.w, p.h, r), p.w, p.h, r) : p.v });

/**
 * Filtro guiado (He et al.): a borda da máscara passa a seguir as bordas da
 * própria foto, pegando cabelo, dedos e o vão entre as pernas.
 */
export function refineEdges(mask: Plane, guide: Plane, r: number, eps = 0.002): Plane {
  const { w, h } = mask;
  const I = guide.v, p = mask.v;
  const n = w * h;
  const Ip = new Float32Array(n), II = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    Ip[i] = I[i] * p[i];
    II[i] = I[i] * I[i];
  }
  const mI = boxMean(I, w, h, r), mp = boxMean(p, w, h, r), mIp = boxMean(Ip, w, h, r), mII = boxMean(II, w, h, r);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cov = mIp[i] - mI[i] * mp[i];
    const v = mII[i] - mI[i] * mI[i];
    a[i] = cov / (v + eps);
    b[i] = mp[i] - a[i] * mI[i];
  }
  const ma = boxMean(a, w, h, r), mb = boxMean(b, w, h, r);
  const out = plane(w, h);
  for (let i = 0; i < n; i++) {
    const q = ma[i] * I[i] + mb[i];
    // Aperta a transição para não sobrar halo do fundo gerado.
    const t = Math.min(1, Math.max(0, (q - 0.2) / 0.6));
    out.v[i] = t * t * (3 - 2 * t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Segmentação

async function fetchBytes(url: string) {
  const res = await httpFetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar a máscara (${res.status})`);
  return res;
}

/** Cada objeto encontrado vira uma máscara separada. */
async function sam3(imageUrl: string, prompt: string, ctx: JobContext): Promise<ImageBitmap[]> {
  const [url] = await replicateRun({ version: SAM3_VERSION }, { image: imageUrl, prompt, mask_only: true, return_zip: true, threshold: 0.4 }, ctx);
  if (!url) return [];
  const res = await fetchBytes(url);
  if (/\.zip(\?|$)/i.test(url) || res.headers.get("content-type")?.includes("zip")) {
    const entries = await readZip(await res.arrayBuffer());
    const masks = entries.filter((e) => /\.png$/i.test(e.name) && !/overlay/i.test(e.name));
    return Promise.all(masks.map((e) => createImageBitmap(new Blob([e.data as BlobPart], { type: "image/png" }))));
  }
  return [await createImageBitmap(await res.blob())];
}

/** Segmentador antigo, se o SAM 3 falhar: uma máscara só, com tudo junto. */
async function groundedSam(imageUrl: string, prompt: string, ctx: JobContext): Promise<ImageBitmap[]> {
  const urls = await replicateRun({ version: SEGMENT_VERSION }, { image: imageUrl, mask_prompt: prompt, negative_mask_prompt: "", adjustment_factor: 0 }, ctx);
  const url = urls.find((u) => /\/mask\.(jpe?g|png)(\?|$)/i.test(u)) ?? (urls.length === 4 ? urls[2] : undefined);
  return url ? [await createImageBitmap(await (await fetchBytes(url)).blob())] : [];
}

export async function findObjects(imageUrl: string, object: string, ctx: JobContext): Promise<{ masks: ImageBitmap[]; calls: number }> {
  const prompt = translateObject(object);
  if (!prompt) return { masks: [], calls: 0 };
  try {
    return { masks: await sam3(imageUrl, prompt, ctx), calls: 1 };
  } catch (e) {
    if (ctx.signal?.aborted) throw e;
    return { masks: await groundedSam(imageUrl, prompt, ctx).catch(() => []), calls: 1 };
  }
}

// ---------------------------------------------------------------------------
// Montagem da máscara final

export interface ObjectMaskInput {
  w: number;
  h: number;
  /** Máscaras do resultado, uma por objeto. */
  found: ImageBitmap[];
  /** O que a pessoa segura (garrafa, taça, bolsa…), para colar junto. */
  attached?: ImageBitmap[];
  /** O que já existia no original (só quando estamos adicionando). */
  existing: ImageBitmap[] | null;
  original: CanvasImageSource;
  result: CanvasImageSource;
  /** Seleção do usuário com folga, no tamanho de trabalho (ou null = sem limite). */
  area: Plane | null;
  shadow: boolean;
}

export interface ObjectMask {
  alpha: Plane;
  kept: number;
  /** Aviso para o usuário quando o encaixe precisou de um plano B. */
  note?: string;
}

export function buildObjectMask(o: ObjectMaskInput): ObjectMask | null {
  const { w, h } = o;
  const n = w * h;
  const diff = difference(o.original, o.result, w, h);
  let before: Plane | null = null;
  if (o.existing?.length) {
    before = plane(w, h);
    for (const m of o.existing) {
      const p = maskPlane(m, w, h);
      for (let i = 0; i < n; i++) before.v[i] = Math.max(before.v[i], p.v[i]);
    }
  }

  type Candidate = { p: Plane; box: [number, number, number, number]; inside: number };
  const fresh: Candidate[] = [];
  for (const m of o.found) {
    const p = maskPlane(m, w, h);
    let area = 0, inside = 0, overlap = 0, changed = 0;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (p.v[i] < 0.5) continue;
        area++;
        if (!o.area || o.area.v[i] > 0.3) inside++;
        if (before && before.v[i] > 0.5) overlap++;
        changed += diff.v[i];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (area < n * 0.0003) continue;
    // Pessoa que já estava lá (redesenhada ou não): mantém a original.
    if (before && overlap / area > 0.45) continue;
    // Nada mudou de verdade: não precisa colar.
    if (changed / area < 0.08) continue;
    fresh.push({ p, box: [x0, y0, x1, y1], inside: inside / area });
  }
  if (!fresh.length) return null;

  // Fica com tudo que é novo e encosta na área marcada, inteiro: se a IA
  // sentou a segunda pessoa um pouco além da borda, ela vem completa em vez
  // de cortada ao meio. O que nasceu longe da área fica de fora.
  let chosen = fresh.filter((c) => c.inside >= 0.1);
  let note: string | undefined;
  if (!chosen.length) {
    chosen = fresh;
    note = "A IA colocou o objeto um pouco fora da área marcada; colei ele inteiro mesmo assim.";
  }
  const union = plane(w, h);
  const boxes = chosen.map((c) => c.box);
  for (const c of chosen) for (let i = 0; i < n; i++) union.v[i] = Math.max(union.v[i], c.p.v[i]);

  // Objetos nas mãos: entram se são novos e estão encostados em quem foi colado.
  const near = boxes.map(([x0, y0, x1, y1]) => {
    const px = (x1 - x0) * 0.35, py = (y1 - y0) * 0.12;
    return [x0 - px, y0 - py, x1 + px, y1 + py];
  });
  for (const m of o.attached ?? []) {
    const p = maskPlane(m, w, h);
    let area = 0, inNear = 0, changed = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (p.v[i] < 0.5) continue;
        area++;
        changed += diff.v[i];
        if (near.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d)) inNear++;
      }
    }
    if (!area || inNear / area < 0.6 || changed / area < 0.08) continue;
    for (let i = 0; i < n; i++) union.v[i] = Math.max(union.v[i], p.v[i]);
  }

  const guide = luma(o.result, w, h);
  const r = Math.max(2, Math.round(Math.min(w, h) * 0.004));
  const alpha = refineEdges(union, guide, r);

  // Zona de contato: perna dentro da água, reflexo, respingo, almofada que
  // afundou. O segmentador não chama isso de "pessoa", mas faz parte dela.
  // Mudança que puxou forte para o vermelho é marcação copiada, não cena.
  const red = redShift(o.original, o.result, w, h);
  {
    const contact = plane(w, h);
    for (const [x0, y0, x1, y1] of boxes) {
      const bw = x1 - x0, bh = y1 - y0;
      const cx0 = Math.max(0, Math.round(x0 - bw * 0.25)), cx1 = Math.min(w - 1, Math.round(x1 + bw * 0.25));
      const cy0 = Math.max(0, Math.round(y0 + bh * 0.4)), cy1 = Math.min(h - 1, Math.round(y1 + bh * 0.45));
      for (let y = cy0; y <= cy1; y++) {
        // Some suavemente para baixo, para não virar um retângulo.
        const solid = y1 + bh * 0.2;
        const fall = y <= solid ? 1 : 1 - (y - solid) / Math.max(1, cy1 - solid);
        for (let x = cx0; x <= cx1; x++) {
          const i = y * w + x;
          const d = diff.v[i];
          if (d < 0.12 || red.v[i] > 0.12) continue;
          contact.v[i] = Math.max(contact.v[i], Math.min(1, (d - 0.12) / 0.35) * fall);
        }
      }
    }
    const soft = blur(contact, Math.max(1, Math.round(r / 2)));
    for (let i = 0; i < n; i++) alpha.v[i] = Math.max(alpha.v[i], Math.min(0.97, soft.v[i]));
  }

  if (o.shadow) {
    // Sombra de contato e projetada: onde o resultado ficou mais escuro que o
    // original, perto dos pés de cada objeto.
    const lo = blur(luma(o.original, w, h), 1);
    const lr = blur(guide, 1);
    const shade = plane(w, h);
    for (const [x0, y0, x1, y1] of boxes) {
      const bw = x1 - x0, bh = y1 - y0;
      const sx0 = Math.max(0, Math.round(x0 - bw * 0.9)), sx1 = Math.min(w - 1, Math.round(x1 + bw * 0.9));
      const sy0 = Math.max(0, Math.round(y0 + bh * 0.55)), sy1 = Math.min(h - 1, Math.round(y1 + bh * 0.3));
      for (let y = sy0; y <= sy1; y++) {
        for (let x = sx0; x <= sx1; x++) {
          const i = y * w + x;
          const dark = lo.v[i] - lr.v[i];
          if (dark <= 0.025 || red.v[i] > 0.12) continue;
          const v = Math.min(1, (dark - 0.025) / 0.1);
          shade.v[i] = Math.max(shade.v[i], v);
        }
      }
    }
    const soft = blur(shade, Math.max(1, Math.round(r / 2)));
    for (let i = 0; i < n; i++) alpha.v[i] = Math.max(alpha.v[i], Math.min(0.95, soft.v[i]));
  }

  return { alpha, kept: boxes.length, note };
}

/** Converte uma máscara em canvas de alfa no tamanho pedido. */
export function planeToCanvas(p: Plane, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = p.w;
  c.height = p.h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(p.w, p.h);
  for (let i = 0, j = 0; j < p.v.length; i += 4, j++) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(p.v[j] * 255);
  }
  g.putImageData(img, 0, 0);
  if (p.w === w && p.h === h) return c;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const og = out.getContext("2d")!;
  og.imageSmoothingQuality = "high";
  og.drawImage(c, 0, 0, w, h);
  return out;
}
