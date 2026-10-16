// Executa nodes do canvas: junta as entradas conectadas, chama o fabricante,
// guarda o resultado e registra o custo estimado.
import type { MediaRef } from "../lib/media";
import { modelById, resolveModel } from "../providers/catalog";
import { generateImages, generateText, generateVideo, upscale } from "../providers";
import type { ModelDef } from "../providers/types";
import { useCosts } from "../store/costs";
import { useSpaces, type FlowNode, type Space } from "../store/spaces";
import { notify } from "../store/toasts";
import { isTauri } from "../lib/platform";
import { notifyDesktop } from "../lib/system";
import { useRuns } from "../store/runs";
import { handleType, NODE_SPECS, type NodeOutputs } from "./ports";

const controllers = new Map<string, AbortController>();

interface Inputs {
  texts: string[];
  /** Itens de um node Lista conectado: geram um resultado por item. */
  batch: string[] | null;
  images: MediaRef[];
}

function findSpace(nodeId: string): Space | undefined {
  return useSpaces.getState().spaces.find((s) => s.nodes.some((n) => n.id === nodeId));
}

/** Texto e Lista expõem o próprio conteúdo; os demais, o último resultado escolhido. */
function outputsOf(node: FlowNode): NodeOutputs | undefined {
  if (node.type === "text") return { texts: [node.data.text ?? ""] };
  if (node.type === "list") return { texts: node.data.items ?? [] };
  return node.data.outputs;
}

function collectInputs(space: Space, node: FlowNode): Inputs {
  const inputs: Inputs = { texts: [], batch: null, images: [] };
  for (const edge of space.edges.filter((e) => e.target === node.id)) {
    const source = space.nodes.find((n) => n.id === edge.source);
    const out = source && outputsOf(source);
    if (!source || !out) continue;
    const type = handleType(edge.targetHandle);
    if (type === "text") {
      const texts = (out.texts ?? []).filter((t) => t.trim());
      if (source.type === "list") inputs.batch = [...(inputs.batch ?? []), ...texts];
      else inputs.texts.push(...texts);
    } else if (type === "image") {
      inputs.images.push(...(out.images ?? []));
    }
  }
  return inputs;
}

const joinPrompt = (...parts: (string | undefined)[]) =>
  parts.map((p) => p?.trim()).filter(Boolean).join("\n\n");

const ASSISTANT_MODES: Record<string, string> = {
  prompt:
    "Você é diretor de arte de um estúdio de visualização arquitetônica. Transforme a ideia recebida em um único prompt detalhado, em inglês, para um gerador de imagem ou vídeo. Descreva sujeito, enquadramento, lente, luz, materiais e atmosfera. Responda apenas com o prompt.",
  describe:
    "Descreva a imagem recebida de forma objetiva e detalhada, como um prompt em inglês capaz de recriá-la. Responda apenas com a descrição.",
  variations:
    "Crie 4 variações criativas do prompt recebido, em inglês, uma por linha, sem numeração. Responda apenas com as linhas.",
  free: "Você é um assistente criativo do estúdio Bravo Visuals. Responda em português, de forma direta.",
};

function setNode(nodeId: string, patch: Partial<FlowNode["data"]>) {
  useSpaces.getState().updateNode(nodeId, patch);
}

function requireModel(id: string | undefined, capability: ModelDef["capability"] = "upscale", hasImage = false): ModelDef {
  const model = capability === "upscale" ? (id ? modelById(id) : undefined) : resolveModel(id, capability, hasImage);
  if (!model) throw new Error("Modelo não encontrado no catálogo.");
  return model;
}

async function execute(space: Space, node: FlowNode, ctx: { signal: AbortSignal; onStatus: (s: string) => void }): Promise<NodeOutputs> {
  const d = node.data;
  const inputs = collectInputs(space, node);
  const record = useCosts.getState().record;

  switch (node.type) {
    case "assistant": {
      const model = requireModel(d.modelId, "text", inputs.images.length > 0);
      const prompt = joinPrompt(...inputs.texts, ...(inputs.batch ?? []), d.prompt);
      if (!prompt && !inputs.images.length) throw new Error("Conecte um texto ou imagem, ou escreva uma instrução.");
      const system = ASSISTANT_MODES[d.mode ?? "prompt"] ?? ASSISTANT_MODES.free;
      const text = await generateText({ model, system, prompt: prompt || "Descreva.", images: inputs.images }, ctx);
      // Custo de texto é pequeno; estimamos ~2 mil tokens por chamada.
      record(model, 0.002, true, space);
      const texts = d.mode === "variations" ? text.split("\n").map((t) => t.trim()).filter(Boolean) : [text];
      return { texts };
    }

    case "image": {
      const model = requireModel(d.modelId, "image", inputs.images.length > 0);
      const prompts = (inputs.batch?.length ? inputs.batch : [""]).map((item) => joinPrompt(...inputs.texts, item, d.prompt));
      if (prompts.some((p) => !p)) throw new Error("Escreva um prompt ou conecte um node de texto.");
      const results: MediaRef[] = [];
      for (const [i, prompt] of prompts.entries()) {
        if (prompts.length > 1) ctx.onStatus(`Item ${i + 1} de ${prompts.length}…`);
        const count = d.count ?? 1;
        const imgs = await generateImages(
          { model, prompt, references: model.acceptsImage ? inputs.images : [], aspect: d.aspect ?? "1:1", count },
          ctx,
        );
        record(model, imgs.length, true, space);
        results.push(...imgs);
        setNode(node.id, { gallery: [...imgs, ...(currentGallery(node.id))] });
      }
      // Em lote (node Lista) segue tudo; senão, só a primeira, como a miniatura escolhida.
      return { images: inputs.batch?.length ? results : results.slice(0, 1) };
    }

    case "video": {
      const model = requireModel(d.modelId, "video", inputs.images.length > 0);
      const prompts = (inputs.batch?.length ? inputs.batch : [""]).map((item) => joinPrompt(...inputs.texts, item, d.prompt));
      if (prompts.some((p) => !p) && !inputs.images.length) throw new Error("Escreva um prompt ou conecte texto/imagem.");
      const frames = inputs.images.length ? inputs.images : [undefined];
      const fallback = "Movimento de câmera suave e natural, mantendo a composição da imagem";
      const results: MediaRef[] = [];
      const duration = d.duration ?? model.durations?.[0] ?? 5;
      const total = prompts.length * frames.length;
      let n = 0;
      for (const prompt of prompts) {
        for (const firstFrame of frames) {
          n++;
          if (total > 1) ctx.onStatus(`Vídeo ${n} de ${total}…`);
          const vids = await generateVideo({ model, prompt: prompt || fallback, firstFrame, aspect: d.aspect ?? "16:9", duration }, ctx);
          record(model, duration, true, space);
          results.push(...vids);
          setNode(node.id, { gallery: [...vids, ...currentGallery(node.id)] });
        }
      }
      return { videos: inputs.batch?.length ? results : results.slice(0, 1) };
    }

    case "upscale": {
      const model = requireModel("clarity");
      if (!inputs.images.length) throw new Error("Conecte uma imagem para fazer o upscale.");
      const results: MediaRef[] = [];
      for (const [i, image] of inputs.images.entries()) {
        if (inputs.images.length > 1) ctx.onStatus(`Imagem ${i + 1} de ${inputs.images.length}…`);
        const out = await upscale({ image, scale: d.scale ?? 2, creativity: d.creativity ?? 0.35, prompt: d.prompt }, ctx);
        record(model, 1, true, space);
        results.push(...out);
        setNode(node.id, { gallery: [...out, ...currentGallery(node.id)] });
      }
      return { images: results };
    }

    default:
      return node.data.outputs ?? {};
  }
}

function currentGallery(nodeId: string): MediaRef[] {
  const node = findSpace(nodeId)?.nodes.find((n) => n.id === nodeId);
  return node?.data.gallery ?? [];
}

export interface Estimate {
  jobs: number;
  usd: number;
}

/** Quantas chamadas pagas um node vai fazer e quanto deve custar, antes de rodar. */
export function estimateNode(space: Space, node: FlowNode): Estimate {
  const d = node.data;
  const inputs = collectInputs(space, node);
  const prompts = Math.max(inputs.batch?.length ?? 0, 1);
  const hasImage = inputs.images.length > 0;
  switch (node.type) {
    case "image": {
      const m = resolveModel(d.modelId, "image", hasImage);
      const n = prompts * (d.count ?? 1);
      return { jobs: prompts, usd: n * (m?.price.usd ?? 0) };
    }
    case "video": {
      const m = resolveModel(d.modelId, "video", hasImage);
      const n = prompts * Math.max(inputs.images.length, 1);
      return { jobs: n, usd: n * (d.duration ?? m?.durations?.[0] ?? 5) * (m?.price.usd ?? 0) };
    }
    case "upscale": {
      const n = inputs.images.length;
      return { jobs: n, usd: n * (modelById("clarity")?.price.usd ?? 0) };
    }
    case "assistant":
      return { jobs: 1, usd: 0.005 };
    default:
      return { jobs: 0, usd: 0 };
  }
}

const CONFIRM_USD = 1;
const PARALLEL = 3;
/** Jobs mais longos que isso avisam pelo Windows quando terminam. */
const NOTIFY_AFTER_MS = 15_000;

/** Pede confirmação quando a execução sai cara ou dispara várias gerações. */
async function confirmCost(est: Estimate, what: string): Promise<boolean> {
  if (est.jobs <= 1 && est.usd < CONFIRM_USD) return true;
  const msg = `${what} vai fazer ${est.jobs} geração(ões), custo estimado de US$ ${est.usd.toFixed(2)}. Continuar?`;
  if (isTauri) {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return ask(msg, { title: "Confirmar custo", kind: "warning", okLabel: "Gerar", cancelLabel: "Cancelar" });
  }
  return window.confirm(msg);
}

export async function runNode(nodeId: string, confirmed = false): Promise<boolean> {
  {
    const space = findSpace(nodeId);
    const node = space?.nodes.find((n) => n.id === nodeId);
    if (space && node && !confirmed && !(await confirmCost(estimateNode(space, node), NODE_SPECS[node.type!].title))) return false;
  }
  const space = findSpace(nodeId);
  const node = space?.nodes.find((n) => n.id === nodeId);
  if (!space || !node || !NODE_SPECS[node.type!].runnable) return false;
  if (controllers.has(nodeId)) return false;

  const controller = new AbortController();
  controllers.set(nodeId, controller);
  const started = Date.now();
  setNode(nodeId, { status: "running", statusText: "Enviando…", error: undefined, startedAt: started });
  const label = `${NODE_SPECS[node.type!].title} #${node.data.seq ?? 1}`;
  try {
    const outputs = await execute(space, node, {
      signal: controller.signal,
      onStatus: (statusText) => setNode(nodeId, { statusText }),
    });
    setNode(nodeId, { status: "done", statusText: undefined, outputs });
    if (Date.now() - started > NOTIFY_AFTER_MS) notifyDesktop("Bravo Hub", `${label} terminou.`);
    return true;
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    const message = aborted ? "Cancelado" : e instanceof Error ? e.message : String(e);
    setNode(nodeId, { status: aborted ? "idle" : "error", statusText: undefined, error: aborted ? undefined : message });
    if (!aborted) {
      notify(`${label}: ${message}`, "error");
      if (Date.now() - started > NOTIFY_AFTER_MS) notifyDesktop("Bravo Hub", `${label} falhou: ${message}`);
    }
    return false;
  } finally {
    controllers.delete(nodeId);
  }
}

export function cancelNode(nodeId: string) {
  controllers.get(nodeId)?.abort();
}

export const isRunning = (nodeId: string) => controllers.has(nodeId);

function topoOrder(space: Space): string[] {
  const indeg = new Map(space.nodes.map((n) => [n.id, 0]));
  for (const e of space.edges) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  const queue = space.nodes.filter((n) => !indeg.get(n.id)).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of space.edges.filter((x) => x.source === id)) {
      indeg.set(e.target, indeg.get(e.target)! - 1);
      if (indeg.get(e.target) === 0) queue.push(e.target);
    }
  }
  return order;
}

function reachable(space: Space, start: string, dir: "up" | "down"): Set<string> {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    for (const e of space.edges) {
      const next = dir === "up" ? (e.target === id ? e.source : null) : e.source === id ? e.target : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

async function runOrdered(spaceId: string, filter?: (space: Space) => Set<string>) {
  const space = useSpaces.getState().spaces.find((s) => s.id === spaceId);
  if (!space) return;
  const only = filter?.(space);
  const ids = topoOrder(space).filter((id) => (!only || only.has(id)) && NODE_SPECS[space.nodes.find((n) => n.id === id)!.type!].runnable);
  // Estimativa feita antes de rodar: nodes que dependem de resultados ainda não gerados contam pelo menos uma vez.
  const total = ids.reduce<Estimate>((acc, id) => {
    const e = estimateNode(space, space.nodes.find((n) => n.id === id)!);
    return { jobs: acc.jobs + Math.max(e.jobs, 1), usd: acc.usd + e.usd };
  }, { jobs: 0, usd: 0 });
  if (!(await confirmCost(total, "O fluxo"))) return;
  const runs = useRuns.getState();
  runs.start({
    spaceId,
    startedAt: Date.now(),
    estimateUsd: total.usd,
    steps: ids.map((id) => {
      const n = space.nodes.find((x) => x.id === id)!;
      return { nodeId: id, label: `${NODE_SPECS[n.type!].title} #${n.data.seq ?? 1}`, state: "waiting" as const };
    }),
  });

  // Roda em paralelo tudo que já tem as dependências prontas, até PARALLEL por vez.
  const set = new Set(ids);
  const deps = new Map(ids.map((id) => [id, [...reachable(space, id, "up")].filter((d) => d !== id && set.has(d))]));
  const pending = new Set(ids);
  const done = new Set<string>();
  const failed = new Set<string>();
  const running = new Map<string, Promise<string>>();
  while (pending.size || running.size) {
    for (const id of [...pending]) {
      const need = deps.get(id)!;
      if (need.some((d) => failed.has(d))) {
        pending.delete(id);
        failed.add(id);
        runs.step(id, { state: "skipped" });
        continue;
      }
      if (running.size >= PARALLEL || !need.every((d) => done.has(d))) continue;
      pending.delete(id);
      if (isRunning(id)) {
        done.add(id);
        continue;
      }
      runs.step(id, { state: "running", startedAt: Date.now() });
      running.set(
        id,
        runNode(id, true).then((ok) => {
          (ok ? done : failed).add(id);
          runs.step(id, { state: ok ? "done" : "error", endedAt: Date.now() });
          return id;
        }),
      );
    }
    if (!running.size) break;
    running.delete(await Promise.race(running.values()));
  }
  runs.finish();
  if (failed.size) notify(`${failed.size} node(s) não rodaram por erro em uma etapa anterior.`, "error");
  else if (done.size) {
    notify("Fluxo concluído.", "ok");
    notifyDesktop("Bravo Hub", "Fluxo concluído.");
  }
}

/** Roda todos os nodes executáveis em ordem, respeitando as dependências. */
export const runSpace = (spaceId: string) => runOrdered(spaceId);

/** Roda tudo que alimenta este node e depois ele mesmo. */
export const runUpTo = (spaceId: string, nodeId: string) => runOrdered(spaceId, (s) => reachable(s, nodeId, "up"));

/** Roda este node e tudo que depende dele. */
export const runFrom = (spaceId: string, nodeId: string) => runOrdered(spaceId, (s) => reachable(s, nodeId, "down"));

/** Roda uma seleção de nodes na ordem do fluxo. */
export const runSelection = (spaceId: string, ids: string[]) => runOrdered(spaceId, () => new Set(ids));
