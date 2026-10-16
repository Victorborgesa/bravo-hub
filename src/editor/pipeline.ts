// Edição localizada: recorta a área com contexto, envia ao modelo e encaixa o
// resultado de volta só dentro da máscara. Mesmo raciocínio do Modify AI,
// trocando as camadas do Photoshop por canvas.
import { httpFetch } from "../lib/platform";
import { mediaBlob, saveBytes, type MediaRef } from "../lib/media";
import { replicateRun, replicateUpload } from "../providers/replicate";
import { ProviderError, type JobContext, type ModelDef } from "../providers/types";
import { useCosts } from "../store/costs";
import { composePrompt, engineCost, nearestAspect, SEGMENT_COST, SEGMENT_VERSION, tierForSize, translateObject, type EditEngine } from "./engines";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Placement = "object" | "changed" | "shape";

export interface EditOptions {
  image: MediaRef;
  /** Canvas do tamanho da imagem: branco/alfa = área selecionada. */
  mask: HTMLCanvasElement;
  engine: EditEngine;
  category: string;
  action: string;
  instruction: string;
  references: MediaRef[];
  variations: number;
  tier?: string;
  moreContext: boolean;
  maxSide: number;
  placement: Placement;
  objectName: string;
  keepInside: boolean;
}

export interface EditResult {
  media: MediaRef;
  prompt: string;
}

/** Abaixo disto a IA não entende a cena e inventa tudo (medido no Modify). */
const MIN_CONTEXT_PX = 768;
const CONTEXT_FACTOR = 2;

export async function loadBitmap(ref: MediaRef): Promise<ImageBitmap> {
  return createImageBitmap(await mediaBlob(ref));
}

async function bitmapFromUrl(url: string): Promise<ImageBitmap> {
  const res = await httpFetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar o resultado (${res.status})`);
  return createImageBitmap(await res.blob());
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

const toBlob = (c: HTMLCanvasElement, type = "image/png", q?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem"))), type, q));

/** Retângulo que envolve a seleção, ou null se nada foi pintado. */
export function maskBounds(mask: HTMLCanvasElement): Rect | null {
  const { width: w, height: h } = mask;
  const data = mask.getContext("2d")!.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Área enviada à IA: a seleção, crescida para mostrar a cena em volta e
 * ajustada à proporção que o modelo entrega, para o resultado assentar sem
 * esticar.
 */
export function sendRect(sel: Rect, imgW: number, imgH: number, moreContext: boolean, ratios?: string[]): { rect: Rect; aspect?: string } {
  let w = sel.w * (moreContext ? CONTEXT_FACTOR : 1.15);
  let h = sel.h * (moreContext ? CONTEXT_FACTOR : 1.15);
  const short = Math.min(w, h);
  if (short < MIN_CONTEXT_PX) {
    const k = MIN_CONTEXT_PX / short;
    w *= k;
    h *= k;
  }
  let aspect: string | undefined;
  if (ratios) {
    aspect = nearestAspect(ratios, w / h);
    const [aw, ah] = aspect.split(":").map(Number);
    const r = aw / ah;
    if (w / h < r) w = h * r;
    else h = w / r;
  }
  // Não passa do tamanho da imagem; mantém a proporção quando possível.
  const fit = Math.min(1, imgW / w, imgH / h);
  w = Math.max(sel.w, w * fit);
  h = Math.max(sel.h, h * fit);
  w = Math.min(w, imgW);
  h = Math.min(h, imgH);
  const cx = sel.x + sel.w / 2;
  const cy = sel.y + sel.h / 2;
  const x = Math.min(Math.max(0, cx - w / 2), imgW - w);
  const y = Math.min(Math.max(0, cy - h / 2), imgH - h);
  return { rect: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }, aspect };
}

function scaled(rect: Rect, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(rect.w, rect.h));
  return { w: Math.round(rect.w * k), h: Math.round(rect.h * k) };
}

/** Recorte da cena no tamanho de envio. */
async function cropBlob(src: CanvasImageSource, rect: Rect, out: { w: number; h: number }, type: string) {
  const c = canvas(out.w, out.h);
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, out.w, out.h);
  return toBlob(c, type, 0.94);
}

/** Máscara em preto e branco do recorte (branco = pode pintar), para o Flux Fill. */
async function maskBlob(mask: HTMLCanvasElement, rect: Rect, out: { w: number; h: number }) {
  const c = canvas(out.w, out.h);
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, out.w, out.h);
  const white = canvas(mask.width, mask.height);
  const wg = white.getContext("2d")!;
  wg.drawImage(mask, 0, 0);
  wg.globalCompositeOperation = "source-in";
  wg.fillStyle = "#fff";
  wg.fillRect(0, 0, white.width, white.height);
  g.drawImage(white, rect.x, rect.y, rect.w, rect.h, 0, 0, out.w, out.h);
  return toBlob(c);
}

/** Recorte da seleção no tamanho da área enviada, com borda suavizada. */
function selectionAlpha(mask: HTMLCanvasElement, rect: Rect, feather: number) {
  const c = canvas(rect.w, rect.h);
  const g = c.getContext("2d")!;
  g.filter = `blur(${feather}px)`;
  g.drawImage(mask, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return c;
}

/** Converte uma imagem em tons de cinza (branco = mostrar) em máscara de alfa. */
function lumaToAlpha(src: CanvasImageSource, w: number, h: number, feather: number) {
  const c = canvas(w, h);
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = l;
  }
  g.putImageData(img, 0, 0);
  if (!feather) return c;
  const soft = canvas(w, h);
  const sg = soft.getContext("2d")!;
  sg.filter = `blur(${feather}px)`;
  sg.drawImage(c, 0, 0);
  return soft;
}

/** "Só o que mudou": diferença entre o resultado e o original, limpa e suavizada. */
function differenceAlpha(original: CanvasImageSource, result: CanvasImageSource, rect: Rect, feather: number) {
  const a = canvas(rect.w, rect.h);
  const ag = a.getContext("2d")!;
  ag.drawImage(original, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  const b = canvas(rect.w, rect.h);
  const bg = b.getContext("2d")!;
  bg.drawImage(result, 0, 0, rect.w, rect.h);
  const da = ag.getImageData(0, 0, rect.w, rect.h).data;
  const img = bg.getImageData(0, 0, rect.w, rect.h);
  const db = img.data;
  for (let i = 0; i < db.length; i += 4) {
    const diff = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    // Corta o ruído de recompressão; o que mudou de verdade fica sólido.
    const v = diff < 36 ? 0 : Math.min(255, (diff - 36) * 3);
    db[i] = db[i + 1] = db[i + 2] = v;
    db[i + 3] = 255;
  }
  bg.putImageData(img, 0, 0);
  // Dilata um pouco (borrão + reforço) para fechar buracos dentro do objeto.
  const grown = canvas(rect.w, rect.h);
  const gg = grown.getContext("2d")!;
  gg.filter = `blur(${Math.max(2, feather)}px) brightness(2.2)`;
  gg.drawImage(b, 0, 0);
  return lumaToAlpha(grown, rect.w, rect.h, feather);
}

async function segment(imageUrl: string, object: string, ctx: JobContext): Promise<ImageBitmap | null> {
  const target = translateObject(object);
  if (!target) return null;
  const urls = await replicateRun({ version: SEGMENT_VERSION }, { image: imageUrl, mask_prompt: target, negative_mask_prompt: "", adjustment_factor: 0 }, ctx);
  // Saídas conhecidas: anotada, invertida... a máscara positiva termina em /mask.
  const url = urls.find((u) => /\/mask\.(jpe?g|png)(\?|$)/i.test(u)) ?? (urls.length === 4 ? urls[2] : undefined);
  return url ? bitmapFromUrl(url) : null;
}

/** Junta o resultado à imagem original só onde a máscara deixa. */
async function compose(original: ImageBitmap, result: ImageBitmap, rect: Rect, alpha: HTMLCanvasElement) {
  const out = canvas(original.width, original.height);
  const g = out.getContext("2d")!;
  g.drawImage(original, 0, 0);
  const patch = canvas(rect.w, rect.h);
  const pg = patch.getContext("2d")!;
  pg.imageSmoothingQuality = "high";
  pg.drawImage(result, 0, 0, rect.w, rect.h);
  pg.globalCompositeOperation = "destination-in";
  pg.drawImage(alpha, 0, 0);
  g.drawImage(patch, rect.x, rect.y);
  return toBlob(out);
}

function intersect(a: HTMLCanvasElement, b: HTMLCanvasElement) {
  const c = canvas(a.width, a.height);
  const g = c.getContext("2d")!;
  g.drawImage(a, 0, 0);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(b, 0, 0);
  return c;
}

/** Folga em volta da seleção quando o resultado pode sair um pouco dela. */
function grownSelection(mask: HTMLCanvasElement, rect: Rect) {
  const pad = Math.round(Math.max(rect.w, rect.h) * 0.04);
  const c = canvas(rect.w, rect.h);
  const g = c.getContext("2d")!;
  g.filter = `blur(${pad}px)`;
  for (let i = 0; i < 3; i++) g.drawImage(mask, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return c;
}

export function estimateEdit(o: Pick<EditOptions, "engine" | "variations" | "tier" | "placement">) {
  const each = engineCost(o.engine, o.tier) ?? 0.05;
  return o.variations * each + (o.placement === "object" ? o.variations * SEGMENT_COST : 0);
}

export async function runEdit(o: EditOptions, ctx: JobContext & { onResult?: (r: EditResult) => void }): Promise<EditResult[]> {
  const sel = maskBounds(o.mask);
  if (!sel) throw new Error("Pinte ou desenhe a área que você quer modificar.");
  const prompt = composePrompt(o.category, o.action, o.instruction, o.engine.references ? o.references.length : 0);
  if (!prompt) throw new Error("Escolha um pronto ou escreva o que você quer.");

  ctx.onStatus?.("Preparando a área…");
  const original = await loadBitmap(o.image);
  const { rect, aspect } = sendRect(sel, original.width, original.height, o.moreContext, o.engine.kind === "inpaint" ? undefined : o.engine.aspectRatios);
  const out = scaled(rect, o.maxSide);
  const tier = o.engine.tier ? o.tier ?? tierForSize(o.engine.tier, Math.max(out.w, out.h)) : undefined;

  ctx.onStatus?.("Enviando a cena…");
  const sceneUrl = await replicateUpload(await cropBlob(original, rect, out, o.engine.kind === "inpaint" ? "image/png" : "image/jpeg"), "cena.jpg", ctx);
  const refUrls = o.engine.references
    ? await Promise.all(o.references.map(async (r, i) => replicateUpload(await mediaBlob(r), `referencia-${i + 1}.png`, ctx)))
    : [];
  const maskUrl = o.engine.kind === "inpaint" ? await replicateUpload(await maskBlob(o.mask, rect, out), "mascara.png", ctx) : undefined;

  const input: Record<string, unknown> = { prompt };
  if (o.engine.kind === "inpaint") {
    Object.assign(input, { image: sceneUrl, mask: maskUrl, steps: 50, guidance: 60, safety_tolerance: 2, output_format: "png" });
  } else if (o.engine.imagesField === "input_image") {
    Object.assign(input, { input_image: sceneUrl, output_format: "png", aspect_ratio: "match_input_image" });
  } else {
    // Referências primeiro, a cena por último: o pedido diz quem é quem.
    input[o.engine.imagesField ?? "image_input"] = [...refUrls, sceneUrl];
    if (aspect) input.aspect_ratio = aspect;
    if (o.engine.outputFormat) input.output_format = o.engine.outputFormat;
    if (o.engine.tier && tier) input[o.engine.tier.field] = tier;
  }

  const record = useCosts.getState().record;
  const costModel = {
    id: `edit-${o.engine.id}`,
    label: `${o.engine.name} (editor)`,
    provider: "replicate",
    capability: "image",
    apiModel: o.engine.model,
    aspects: [],
    price: { usd: engineCost(o.engine, tier) ?? 0.05, unit: "imagem" },
  } as ModelDef;

  // Motores que devolvem várias imagens numa chamada recebem o número de
  // variações; os outros fazem uma chamada por variação.
  const calls = o.engine.multiImageField && o.variations > 1 ? 1 : o.variations;
  if (o.engine.multiImageField && o.variations > 1) input[o.engine.multiImageField] = o.variations;

  const results: EditResult[] = [];
  const feather = Math.max(2, Math.round(Math.max(rect.w, rect.h) * 0.006));
  const selAlpha = selectionAlpha(o.mask, rect, feather);

  for (let call = 0; call < calls; call++) {
    ctx.onStatus?.(calls > 1 ? `Gerando variação ${call + 1} de ${calls}…` : "Gerando…");
    const urls = await replicateRun({ model: o.engine.model }, { ...input, ...(calls > 1 ? { seed: Math.floor(Math.random() * 1e9) } : {}) }, ctx);
    if (!urls.length) throw new ProviderError("replicate", "O modelo não devolveu imagem.");
    record(costModel, urls.length, true);

    for (const url of urls) {
      ctx.onStatus?.("Encaixando o resultado…");
      const result = await bitmapFromUrl(url);
      let alpha = selAlpha;
      if (o.placement === "object" && o.objectName.trim()) {
        const segmented = await segment(url, o.objectName, ctx).catch(() => null);
        if (segmented) {
          record({ ...costModel, id: "edit-segment", label: "Segmentador (editor)", price: { usd: SEGMENT_COST, unit: "imagem" } }, 1, true);
          const objAlpha = lumaToAlpha(segmented, rect.w, rect.h, feather);
          alpha = o.keepInside ? intersect(objAlpha, grownSelection(o.mask, rect)) : objAlpha;
        }
      } else if (o.placement === "changed") {
        const diff = differenceAlpha(original, result, rect, feather);
        alpha = o.keepInside ? intersect(diff, grownSelection(o.mask, rect)) : diff;
      }
      const blob = await compose(original, result, rect, alpha);
      const media = await saveBytes(new Uint8Array(await blob.arrayBuffer()), "image/png", { model: o.engine.name, prompt: o.instruction || o.action });
      const r = { media, prompt };
      results.push(r);
      ctx.onResult?.(r);
    }
  }
  return results;
}
