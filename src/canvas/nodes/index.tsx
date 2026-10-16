import { useEdges, type NodeProps, type NodeTypes } from "@xyflow/react";
import { ImagePlus, Loader2, Play, Plus, Settings2, Square, Trash2 } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { NodeShell } from "./NodeShell";
import { AspectPicker, ModelPicker, OptionPicker, Preview, Stepper, useInspector } from "./controls";
import { useSpaces, type FlowNode } from "../../store/spaces";
import { AUTO_ID, modelById } from "../../providers/catalog";
import { cancelNode, runNode } from "../engine";
import { saveBytes, type MediaRef } from "../../lib/media";
import { notify } from "../../store/toasts";
import type { BaseNodeData } from "../ports";

type P = NodeProps<FlowNode>;

const useUpdate = (id: string) => {
  const update = useSpaces((s) => s.updateNode);
  return (patch: Partial<FlowNode["data"]>) => update(id, patch);
};

/** Quantas conexões chegam em cada porta de entrada deste node. */
function useIncoming(id: string) {
  const edges = useEdges();
  const count = (handle: string) => edges.filter((e) => e.target === id && e.targetHandle === handle).length;
  return { text: count("in-text"), image: count("in-image") };
}

export async function importFiles(files: File[]): Promise<MediaRef[]> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  if (!images.length) {
    notify("Só dá pra soltar imagens aqui (PNG, JPG ou WebP).", "error");
    return [];
  }
  const out: MediaRef[] = [];
  for (const f of images) out.push(await saveBytes(new Uint8Array(await f.arrayBuffer()), f.type, { prompt: f.name }));
  return out;
}

function RunButton({ id, data }: { id: string; data: BaseNodeData }) {
  const running = data.status === "running";
  return running ? (
    <button className="run-btn is-running nodrag" title="Parar" onClick={() => cancelNode(id)}>
      <Loader2 size={15} className="spin" />
      <Square size={8} className="run-stop" />
    </button>
  ) : (
    <button className="run-btn nodrag" title="Gerar" onClick={() => runNode(id)}>
      <Play size={14} />
    </button>
  );
}

function GearButton({ id }: { id: string }) {
  const open = useInspector((s) => s.open);
  return (
    <button className="pill icon nodrag" title="Configurações" onClick={() => open(id)}>
      <Settings2 size={13} />
    </button>
  );
}

function Connected({ text, image, imageLabel }: { text: number; image: number; imageLabel: string }) {
  if (!text && !image) return null;
  return (
    <div className="connected">
      {text > 0 && <span className="tag tag-text">Prompt conectado</span>}
      {image > 0 && <span className="tag tag-image">{image} {imageLabel}</span>}
    </div>
  );
}

function TextNode({ id, data, selected }: P) {
  const update = useUpdate(id);
  return (
    <NodeShell id={id} kind="text" data={data} selected={selected} width={300}>
      <textarea
        className="text-area nodrag nowheel"
        placeholder="Escreva um prompt, uma ideia ou uma anotação…"
        value={data.text ?? ""}
        rows={7}
        onChange={(e) => update({ text: e.target.value })}
      />
    </NodeShell>
  );
}

function ListNode({ id, data, selected }: P) {
  const update = useUpdate(id);
  const items = data.items ?? [];
  const set = (next: string[]) => update({ items: next });
  return (
    <NodeShell id={id} kind="list" data={data} selected={selected} width={300}>
      <div className="list-items">
        {items.map((item, i) => (
          <div className="list-item" key={i}>
            <span className="list-index">{String(i + 1).padStart(2, "0")}</span>
            <input className="list-input nodrag" value={item} placeholder="Prompt do item" onChange={(e) => set(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <button className="icon-btn nodrag" onClick={() => set(items.filter((_, j) => j !== i))} title="Remover item">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <button className="add-row nodrag" onClick={() => set([...items, ""])}>
          <Plus size={13} /> Adicionar item
        </button>
      </div>
    </NodeShell>
  );
}

const MODES = [
  { value: "prompt", label: "Criar prompt" },
  { value: "describe", label: "Descrever imagem" },
  { value: "variations", label: "Variações" },
  { value: "free", label: "Livre" },
];

function AssistantNode({ id, data, selected }: P) {
  const update = useUpdate(id);
  const incoming = useIncoming(id);
  const result = data.outputs?.texts ?? [];
  return (
    <NodeShell id={id} kind="assistant" data={data} selected={selected} width={340}>
      <div className="assistant-out nodrag nowheel">
        {result.length ? result.map((t, i) => <p key={i}>{t}</p>) : <span className="muted">A resposta do assistente aparece aqui.</span>}
      </div>
      <div className="composer">
        <Connected text={incoming.text} image={incoming.image} imageLabel="imagem(ns)" />
        <textarea className="composer-input nodrag nowheel" rows={2} placeholder="Instrução extra (opcional)…" value={data.prompt ?? ""} onChange={(e) => update({ prompt: e.target.value })} />
        <div className="composer-bar">
          <OptionPicker options={MODES} value={data.mode} onChange={(mode) => update({ mode })} />
          <ModelPicker capability="text" value={data.modelId} onChange={(modelId) => update({ modelId })} />
          <span className="grow" />
          <RunButton id={id} data={data} />
        </div>
      </div>
    </NodeShell>
  );
}

function UploadNode({ id, data, selected }: P) {
  const update = useUpdate(id);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const gallery = data.gallery ?? [];

  async function add(files: File[]) {
    const added = await importFiles(files);
    if (added.length) update({ gallery: [...added, ...gallery], outputs: { images: [added[0]] } });
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    add(Array.from(e.dataTransfer.files));
  };

  return (
    <NodeShell id={id} kind="upload" data={data} selected={selected} width={300}>
      <div
        className={`drop-zone ${over ? "is-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <Preview
          items={gallery}
          selectedId={data.outputs?.images?.[0]?.id}
          onSelect={(m) => update({ outputs: { images: [m] } })}
          empty={<button className="empty-cta nodrag" onClick={() => input.current?.click()}><ImagePlus size={20} /><span>Solte imagens aqui<br />ou clique para escolher</span></button>}
        />
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => add(Array.from(e.target.files ?? []))} />
      {gallery.length > 0 && (
        <div className="composer-bar padded">
          <span className="muted small">{gallery.length} imagem(ns)</span>
          <span className="grow" />
          <button className="pill nodrag" onClick={() => input.current?.click()}><Plus size={12} /> Adicionar</button>
        </div>
      )}
    </NodeShell>
  );
}

function ImageNode({ id, data, selected }: P) {
  const update = useUpdate(id);
  const incoming = useIncoming(id);
  const model = data.modelId === AUTO_ID ? undefined : modelById(data.modelId ?? "");
  const aspects = model?.aspects ?? ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
  return (
    <NodeShell id={id} kind="image" data={data} selected={selected} width={380}>
      <Preview items={data.gallery ?? []} selectedId={data.outputs?.images?.[0]?.id} onSelect={(m) => update({ outputs: { images: [m] } })} aspect={data.aspect} empty={null} />
      <div className="composer">
        <Connected text={incoming.text} image={incoming.image} imageLabel="referência(s)" />
        <textarea className="composer-input nodrag nowheel" rows={2} placeholder="Descreva a imagem que você deseja gerar…" value={data.prompt ?? ""} onChange={(e) => update({ prompt: e.target.value })} />
        <div className="composer-bar">
          <Stepper value={data.count ?? 1} onChange={(count) => update({ count })} />
          <ModelPicker
            capability="image"
            value={data.modelId}
            onChange={(modelId) => {
              const next = modelById(modelId);
              update({ modelId, aspect: !next || next.aspects.includes(data.aspect ?? "") ? data.aspect : next.aspects[0] });
            }}
          />
          <AspectPicker options={aspects} value={data.aspect} onChange={(aspect) => update({ aspect })} />
          <GearButton id={id} />
          <span className="grow" />
          <RunButton id={id} data={data} />
        </div>
      </div>
    </NodeShell>
  );
}

function VideoNode({ id, data, selected }: P) {
  const update = useUpdate(id);
  const incoming = useIncoming(id);
  const model = data.modelId === AUTO_ID ? undefined : modelById(data.modelId ?? "");
  const aspects = model?.aspects ?? ["16:9", "9:16"];
  const durations = model?.durations ?? [4, 6, 8];
  return (
    <NodeShell id={id} kind="video" data={data} selected={selected} width={380}>
      <Preview items={data.gallery ?? []} selectedId={data.outputs?.videos?.[0]?.id} onSelect={(m) => update({ outputs: { videos: [m] } })} aspect={data.aspect} empty={null} />
      <div className="composer">
        <Connected text={incoming.text} image={incoming.image} imageLabel="quadro(s) inicial(is)" />
        <textarea className="composer-input nodrag nowheel" rows={2} placeholder="Movimento de câmera, ação, clima…" value={data.prompt ?? ""} onChange={(e) => update({ prompt: e.target.value })} />
        <div className="composer-bar">
          <ModelPicker
            capability="video"
            value={data.modelId}
            onChange={(modelId) => {
              const next = modelById(modelId);
              update({
                modelId,
                aspect: !next || next.aspects.includes(data.aspect ?? "") ? data.aspect : next.aspects[0],
                duration: !next || next.durations?.includes(data.duration ?? 0) ? data.duration : next.durations?.[0],
              });
            }}
          />
          <AspectPicker options={aspects} value={data.aspect} onChange={(aspect) => update({ aspect })} />
          <OptionPicker options={durations.map((d) => ({ value: d }))} value={data.duration} onChange={(duration) => update({ duration })} format={(d) => `${d}s`} />
          <GearButton id={id} />
          <span className="grow" />
          <RunButton id={id} data={data} />
        </div>
      </div>
    </NodeShell>
  );
}

function UpscaleNode({ id, data, selected }: P) {
  const update = useUpdate(id);
  return (
    <NodeShell id={id} kind="upscale" data={data} selected={selected} width={320}>
      <Preview
        items={data.gallery ?? []}
        selectedId={data.outputs?.images?.[0]?.id}
        onSelect={(m) => update({ outputs: { images: [m] } })}
        empty={<span className="muted small">Conecte uma imagem e rode o upscale</span>}
      />
      <div className="composer">
        <div className="composer-bar">
          <OptionPicker options={[{ value: 2 }, { value: 4 }]} value={data.scale} onChange={(scale) => update({ scale })} format={(s) => `${s}x`} />
          <label className="slider nodrag" title="Criatividade">
            <span>Criatividade</span>
            <input type="range" min={0} max={1} step={0.05} value={data.creativity ?? 0.35} onChange={(e) => update({ creativity: Number(e.target.value) })} />
            <b>{(data.creativity ?? 0.35).toFixed(2)}</b>
          </label>
          <span className="grow" />
          <RunButton id={id} data={data} />
        </div>
      </div>
    </NodeShell>
  );
}

export const nodeTypes: NodeTypes = {
  text: TextNode,
  list: ListNode,
  assistant: AssistantNode,
  upload: UploadNode,
  image: ImageNode,
  video: VideoNode,
  upscale: UpscaleNode,
};
