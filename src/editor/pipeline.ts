// Edição localizada: recorta a área com contexto, envia ao modelo e encaixa o
// resultado de volta só dentro da máscara. Mesmo raciocínio do Modify AI,
// trocando as camadas do Photoshop por canvas.
import { httpFetch } from "../lib/platform";
import { mediaBlob, saveBytes, type MediaRef } from "../lib/media";
import { replicateRun, replicateUpload } from "../providers/replicate";
import { ProviderError, type JobContext, type ModelDef } from "../providers/types";
import { useCosts } from "../store/costs";
import { composePrompt, engineCost, integrationOf, nearestAspect, propsFromText, SAM3_COST, tierForSize, wrapDirected, type EditEngine } from "./engines";
import { directPrompt, splitProps } from "./director";
import { alphaPlane, buildObjectMask, findObjects, planeToCanvas } from "./segment";

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
  /** Levar a sombra do objeto junto no recorte. */
  shadow: boolean;
  /** Deixar o diretor de prompt reescrever o pedido olhando a cena. */
  director: boolean;
  /** Pedido final já revisado pelo usuário: vai exatamente assim. */
  promptOverride?: string;
}

export interface EditResult {
  media: MediaRef;
  prompt: string;
  /** Só o objeto recortado, com fundo transparente. */
  cutout?: MediaRef;
  /** Aviso sobre como o resultado foi encaixado. */
  note?: string;
  /** Quanto cada etapa levou, em segundos. */
  timings?: [string, number][];
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

const DIRECTOR_COST = 0.003;

export function estimateEdit(o: Pick<EditOptions, "engine" | "variations" | "tier" | "placement" | "director" | "category" | "action">) {
  const each = engineCost(o.engine, o.tier) ?? 0.05;
  let total = o.variations * each;
  if (o.placement === "object") total += (o.variations + (integrationOf(o.category, o.action) === "inserir" ? 1 : 0)) * SAM3_COST;
  if (o.director) total += DIRECTOR_COST;
  return total;
}

interface Prepared {
  original: ImageBitmap;
  rect: Rect;
  aspect?: string;
  out: { w: number; h: number };
  tier?: string;
}

async function prepare(o: EditOptions): Promise<Prepared> {
  const sel = maskBounds(o.mask);
  if (!sel) throw new Error("Pinte ou desenhe a área que você quer modificar.");
  const original = await loadBitmap(o.image);
  const { rect, aspect } = sendRect(sel, original.width, original.height, o.moreContext, o.engine.kind === "inpaint" ? undefined : o.engine.aspectRatios);
  const out = scaled(rect, o.maxSide);
  const tier = o.engine.tier ? o.tier ?? tierForSize(o.engine.tier, Math.max(out.w, out.h)) : undefined;
  return { original, rect, aspect, out, tier };
}

/** A cena como o diretor vê: a área da edição em laranja, o resto um pouco apagado. */
async function directorView(o: EditOptions, p: Prepared) {
  const k = Math.min(1, 1024 / Math.max(p.rect.w, p.rect.h));
  const w = Math.round(p.rect.w * k), h = Math.round(p.rect.h * k);
  const c = canvas(w, h);
  const g = c.getContext("2d")!;
  g.drawImage(p.original, p.rect.x, p.rect.y, p.rect.w, p.rect.h, 0, 0, w, h);
  const tint = canvas(w, h);
  const tg = tint.getContext("2d")!;
  tg.drawImage(o.mask, p.rect.x, p.rect.y, p.rect.w, p.rect.h, 0, 0, w, h);
  tg.globalCompositeOperation = "source-in";
  tg.fillStyle = "rgba(255, 120, 40, 0.42)";
  tg.fillRect(0, 0, w, h);
  g.drawImage(tint, 0, 0);
  return toBlob(c, "image/jpeg", 0.88);
}

interface BuiltPrompt {
  prompt: string;
  directed: boolean;
  /** Por que o diretor não escreveu, quando ele estava ligado. */
  directorError?: string;
  /** Objetos que a pessoa adicionada segura: entram no recorte junto com ela. */
  props: string[];
}

async function buildPrompt(o: EditOptions, p: Prepared, ctx: JobContext): Promise<BuiltPrompt> {
  if (o.promptOverride?.trim()) {
    const { text, props } = splitProps(o.promptOverride);
    return { prompt: text, directed: false, props: props.length ? props : propsFromText(o.instruction) };
  }
  const refs = o.engine.references ? o.references.length : 0;
  let directorError: string | undefined;
  if (o.director) {
    ctx.onStatus?.("Diretor lendo a cena…");
    const directed = await directPrompt(
      { engine: o.engine, category: o.category, action: o.action, instruction: o.instruction, references: refs, scene: await directorView(o, p) },
      ctx,
    );
    if ("text" in directed) return { prompt: wrapDirected(directed.text, refs, o.engine.kind === "inpaint"), directed: true, props: directed.props };
    directorError = directed.error;
  }
  const prompt = composePrompt(o.category, o.action, o.instruction, refs);
  if (!prompt) throw new Error("Escolha um pronto ou escreva o que você quer.");
  return { prompt, directed: false, directorError, props: propsFromText(o.instruction) };
}

/** Mostra o pedido que vai para a IA, para revisar antes de gastar a geração. */
export async function previewPrompt(o: EditOptions, ctx: JobContext): Promise<{ prompt: string; directed: boolean }> {
  const b = await buildPrompt(o, await prepare(o), ctx);
  // A linha PROPS fica visível na revisão; ela não vai para o gerador.
  return { prompt: `${b.prompt}\n\nPROPS: ${b.props.length ? b.props.join(", ") : "none"}`, directed: b.directed };
}

export async function runEdit(o: EditOptions, ctx: JobContext & { onResult?: (r: EditResult) => void }): Promise<EditResult[]> {
  const timings: [string, number][] = [];
  const timed = async <T,>(label: string, work: Promise<T>): Promise<T> => {
    const t0 = performance.now();
    try {
      return await work;
    } finally {
      const secs = (performance.now() - t0) / 1000;
      const prev = timings.find((t) => t[0] === label);
      if (prev) prev[1] += secs;
      else timings.push([label, secs]);
    }
  };

  ctx.onStatus?.("Preparando a área…");
  const prep = await timed("preparo", prepare(o));
  const { original, rect, aspect, out, tier } = prep;

  // O diretor (Google) e o envio da cena (Replicate) não dependem um do
  // outro: correm juntos.
  ctx.onStatus?.(o.director && !o.promptOverride ? "Diretor lendo a cena e enviando…" : "Enviando a cena…");
  const [{ prompt, props, directorError }, { sceneUrl, refUrls, maskUrl }] = await Promise.all([
    timed("diretor", buildPrompt(o, prep, { ...ctx, onStatus: undefined })),
    timed(
      "envio",
      (async () => {
        const sceneUrl = await replicateUpload(await cropBlob(original, rect, out, o.engine.kind === "inpaint" ? "image/png" : "image/jpeg"), "cena.jpg", ctx);
        const refUrls = o.engine.references
          ? await Promise.all(o.references.map(async (r, i) => replicateUpload(await mediaBlob(r), `referencia-${i + 1}.png`, ctx)))
          : [];
        const maskUrl = o.engine.kind === "inpaint" ? await replicateUpload(await maskBlob(o.mask, rect, out), "mascara.png", ctx) : undefined;
        return { sceneUrl, refUrls, maskUrl };
      })(),
    ),
  ]);

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
  const segModel = { ...costModel, id: "edit-segment", label: "Recorte SAM 3 (editor)", apiModel: "sam3", price: { usd: SAM3_COST, unit: "imagem" } } as ModelDef;

  // Motores que devolvem várias imagens numa chamada recebem o número de
  // variações; os outros fazem uma chamada por variação.
  const calls = o.engine.multiImageField && o.variations > 1 ? 1 : o.variations;
  if (o.engine.multiImageField && o.variations > 1) input[o.engine.multiImageField] = o.variations;

  const results: EditResult[] = [];
  const feather = Math.max(2, Math.round(Math.max(rect.w, rect.h) * 0.006));
  const selAlpha = selectionAlpha(o.mask, rect, feather);
  // Campo vazio no recorte exato: em "Pessoas" o alvo é sempre pessoa.
  const objectName = o.objectName.trim() || (o.category === "Pessoas" ? "pessoa" : "");
  const wantsObject = o.placement === "object" && objectName.length > 0;
  // Sem nada para recortar, compara com o original em vez de usar a seleção
  // inteira (que cortaria quem passou da borda).
  const placement = o.placement === "object" && !objectName ? "changed" : o.placement;
  const adding = integrationOf(o.category, o.action) === "inserir";
  // O que já existia na cena é procurado uma vez só (depois da primeira
  // geração, uma chamada por vez, para não esbarrar no limite do Replicate).
  let existing: ImageBitmap[] | null | undefined;
  const segmentOnce = async (url: string, what: string) => {
    const r = await timed("recorte", findObjects(url, what, ctx)).catch((e) => {
      if (ctx.signal?.aborted) throw e;
      return { masks: [] as ImageBitmap[], calls: 0 };
    });
    if (r.calls) record(segModel, r.calls, true);
    return r.masks;
  };

  for (let call = 0; call < calls; call++) {
    ctx.onStatus?.(calls > 1 ? `Gerando variação ${call + 1} de ${calls}…` : "Gerando…");
    const urls = await timed("geração", replicateRun({ model: o.engine.model }, { ...input, ...(calls > 1 ? { seed: Math.floor(Math.random() * 1e9) } : {}) }, ctx));
    if (!urls.length) throw new ProviderError("replicate", "O modelo não devolveu imagem.");
    record(costModel, urls.length, true);

    for (const url of urls) {
      ctx.onStatus?.("Encaixando o resultado…");
      const result = await timed("download", bitmapFromUrl(url));
      let alpha = selAlpha;
      let note: string | undefined;
      let cutout: MediaRef | undefined;

      if (wantsObject) {
        ctx.onStatus?.("Recortando o contorno…");
        const found = { masks: await segmentOnce(url, objectName) };
        if (existing === undefined) existing = adding && found.masks.length ? await segmentOnce(sceneUrl, objectName) : null;
        const attached: ImageBitmap[] = [];
        if (found.masks.length && objectName !== props.join(", ")) {
          for (const prop of props) attached.push(...(await segmentOnce(url, prop)));
        }
        // Tamanho de trabalho: o do resultado, limitado para não pesar.
        const k = Math.min(1, 2048 / Math.max(result.width, result.height));
        const W = Math.round(result.width * k), H = Math.round(result.height * k);
        const before = canvas(W, H);
        before.getContext("2d")!.drawImage(original, rect.x, rect.y, rect.w, rect.h, 0, 0, W, H);
        const t0 = performance.now();
        const built = found.masks.length
          ? buildObjectMask({
              w: W,
              h: H,
              found: found.masks,
              existing,
              attached,
              original: before,
              result,
              area: o.keepInside ? alphaPlane(grownSelection(o.mask, rect), W, H) : null,
              shadow: o.shadow,
            })
          : null;
        timings.push(["contorno", (performance.now() - t0) / 1000]);
        if (built) {
          alpha = planeToCanvas(built.alpha, rect.w, rect.h);
          note = built.note;
          cutout = await saveCutout(result, rect, alpha, o);
        } else {
          // Não achou nada novo com esse nome: cai para o que mudou.
          const diff = differenceAlpha(original, result, rect, feather);
          alpha = intersect(diff, grownSelection(o.mask, rect));
          note = `Não encontrei "${objectName}" novo na área; encaixei pelo que mudou.`;
        }
      } else if (placement === "changed") {
        const diff = differenceAlpha(original, result, rect, feather);
        alpha = o.keepInside ? intersect(diff, grownSelection(o.mask, rect)) : diff;
      }
      // Rede de segurança: máscara praticamente vazia vira aviso, não resultado mudo.
      if (o.placement !== "shape" && coverage(alpha) < 0.0015) {
        const diff = differenceAlpha(original, result, rect, feather);
        if (coverage(diff) > coverage(alpha)) alpha = intersect(diff, grownSelection(o.mask, rect));
        note = "Quase nada mudou dentro da área marcada. Tente o motor Nano Banana, descreva onde a pessoa fica, ou use \"Contorno da seleção\".";
      }
      const media = await timed(
        "montagem",
        (async () => {
          const blob = await compose(original, result, rect, alpha);
          return saveBytes(new Uint8Array(await blob.arrayBuffer()), "image/png", { model: o.engine.name, prompt: o.instruction || o.action });
        })(),
      );
      if (directorError && o.director && !o.promptOverride) note = [note, `Diretor de prompt não respondeu (${directorError}); usei o pedido padrão.`].filter(Boolean).join(" ");
      const r: EditResult = { media, prompt, cutout, note, timings: timings.map(([l, s]) => [l, Math.round(s * 10) / 10]) };
      results.push(r);
      ctx.onResult?.(r);
    }
  }
  return results;
}

/** Fração da área com alfa visível (amostrada, para ser rápida). */
function coverage(c: HTMLCanvasElement) {
  const k = Math.min(1, 256 / Math.max(c.width, c.height));
  const w = Math.max(1, Math.round(c.width * k)), h = Math.max(1, Math.round(c.height * k));
  const small = canvas(w, h);
  const g = small.getContext("2d")!;
  g.drawImage(c, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let on = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 60) on++;
  return on / (w * h);
}

/** PNG transparente só com o objeto (e a sombra), pronto para o Photoshop. */
async function saveCutout(result: ImageBitmap, rect: Rect, alpha: HTMLCanvasElement, o: EditOptions) {
  const patch = canvas(rect.w, rect.h);
  const g = patch.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(result, 0, 0, rect.w, rect.h);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(alpha, 0, 0);
  const blob = await toBlob(patch);
  return saveBytes(new Uint8Array(await blob.arrayBuffer()), "image/png", { model: `${o.engine.name} · recorte`, prompt: o.objectName });
}
