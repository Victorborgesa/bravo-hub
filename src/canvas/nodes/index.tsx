import type { NodeProps, NodeTypes } from "@xyflow/react";
import { Plus, Trash2, ImagePlus } from "lucide-react";
import { useRef } from "react";
import { NodeShell } from "./NodeShell";
import { Chips, Field, Gallery, ModelSelect } from "./controls";
import { useSpaces, type FlowNode } from "../../store/spaces";
import { modelById } from "../../providers/catalog";
import { saveBytes, type MediaRef } from "../../lib/media";
import { notify } from "../../store/toasts";

type P = NodeProps<FlowNode>;

const useUpdate = (id: string) => {
  const update = useSpaces((s) => s.updateNode);
  return (patch: Partial<FlowNode["data"]>) => update(id, patch);
};

function TextNode({ id, data, selected }: P) {
  const update = useUpdate(id);
  return (
    <NodeShell id={id} kind="text" data={data} selected={selected} width={300}>
      <textarea
        className="field area nodrag nowheel"
        placeholder="Escreva um prompt, uma ideia ou uma anotação…"
        value={data.text ?? ""}
        rows={6}
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
            <span className="list-index">{String(i + 1).padStart(3, "0")}</span>
            <input
              className="field nodrag"
              value={item}
              placeholder="Prompt do item"
              onChange={(e) => set(items.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button className="icon-btn nodrag" onClick={() => set(items.filter((_, j) => j !== i))} title="Remover item">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <button className="btn btn-ghost nodrag" onClick={() => set([...items, ""])}>
          <Plus size={13} /> Adicionar item
        </button>
      </div>
    </NodeShell>
  );
}

const MODES = [
  { id: "prompt", label: "Criar prompt" },
  { id: "describe", label: "Descrever imagem" },
  { id: "variations", label: "Variações" },
  { id: "free", label: "Livre" },
];

function AssistantNode({ id, data, selected }: P) {
  const update = useUpdate(id);
  const result = data.outputs?.texts ?? [];
  return (
    <NodeShell id={id} kind="assistant" data={data} selected={selected} runLabel="Executar" width={320}>
      <Field label="Modelo">
        <ModelSelect capability="text" value={data.modelId} onChange={(modelId) => update({ modelId })} />
      </Field>
      <Field label="Modo">
        <select className="field nodrag" value={data.mode} onChange={(e) => update({ mode: e.target.value })}>
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </Field>
      <textarea
        className="field area nodrag nowheel"
        rows={3}
        placeholder="Instrução extra (opcional)"
        value={data.prompt ?? ""}
        onChange={(e) => update({ prompt: e.target.value })}
      />
      {result.length > 0 && (
        <div className="assistant-out nodrag nowheel">
          {result.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </div>
      )}
    </NodeShell>
  );
}

function UploadNode({ id, data, selected }: P) {
  const update = useUpdate(id);
  const input = useRef<HTMLInputElement>(null);
  const gallery = data.gallery ?? [];
  const selectedId = data.outputs?.images?.[0]?.id;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    try {
      const added: MediaRef[] = [];
      for (const f of Array.from(files)) {
        added.push(await saveBytes(new Uint8Array(await f.arrayBuffer()), f.type || "image/png", { prompt: f.name }));
      }
      update({ gallery: [...added, ...gallery], outputs: { images: [added[0]] } });
    } catch (e) {
      notify(`Falha ao importar: ${e instanceof Error ? e.message : e}`, "error");
    }
  }

  return (
    <NodeShell id={id} kind="upload" data={data} selected={selected} width={280}>
      <Gallery items={gallery} selectedId={selectedId} onSelect={(m) => update({ outputs: { images: [m] } })} empty="Nenhuma imagem ainda" />
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <button className="btn btn-ghost nodrag" onClick={() => input.current?.click()}>
        <ImagePlus size={14} /> Escolher imagens
      </button>
    </NodeShell>
  );
}

function ImageNode({ id, data, selected }: P) {
  const update = useUpdate(id);
  const model = modelById(data.modelId ?? "");
  const gallery = data.gallery ?? [];
  return (
    <NodeShell id={id} kind="image" data={data} selected={selected} width={340}>
      <Gallery items={gallery} selectedId={data.outputs?.images?.[0]?.id} onSelect={(m) => update({ outputs: { images: [m] } })} empty="As imagens geradas aparecem aqui" />
      <textarea
        className="field area nodrag nowheel"
        rows={3}
        placeholder="Prompt (soma com o texto conectado)"
        value={data.prompt ?? ""}
        onChange={(e) => update({ prompt: e.target.value })}
      />
      <Field label="Modelo">
        <ModelSelect
          capability="image"
          value={data.modelId}
          onChange={(modelId) => {
            const next = modelById(modelId)!;
            update({ modelId, aspect: next.aspects.includes(data.aspect ?? "") ? data.aspect : next.aspects[0] });
          }}
        />
      </Field>
      {model && (
        <Field label="Proporção">
          <Chips options={model.aspects} value={data.aspect} onChange={(aspect) => update({ aspect })} />
        </Field>
      )}
      <Field label="Quantidade">
        <Chips options={[1, 2, 3, 4]} value={data.count ?? 1} onChange={(count) => update({ count })} />
      </Field>
    </NodeShell>
  );
}

function VideoNode({ id, data, selected }: P) {
  const update = useUpdate(id);
  const model = modelById(data.modelId ?? "");
  const gallery = data.gallery ?? [];
  return (
    <NodeShell id={id} kind="video" data={data} selected={selected} width={340}>
      <Gallery items={gallery} selectedId={data.outputs?.videos?.[0]?.id} onSelect={(m) => update({ outputs: { videos: [m] } })} empty="Os vídeos gerados aparecem aqui" />
      <textarea
        className="field area nodrag nowheel"
        rows={3}
        placeholder="Movimento de câmera, ação, clima…"
        value={data.prompt ?? ""}
        onChange={(e) => update({ prompt: e.target.value })}
      />
      <Field label="Modelo">
        <ModelSelect
          capability="video"
          value={data.modelId}
          onChange={(modelId) => {
            const next = modelById(modelId)!;
            update({
              modelId,
              aspect: next.aspects.includes(data.aspect ?? "") ? data.aspect : next.aspects[0],
              duration: next.durations?.includes(data.duration ?? 0) ? data.duration : next.durations?.[0],
            });
          }}
        />
      </Field>
      {model && (
        <div className="field-row">
          <Field label="Proporção">
            <Chips options={model.aspects} value={data.aspect} onChange={(aspect) => update({ aspect })} />
          </Field>
          <Field label="Duração">
            <Chips options={model.durations ?? []} value={data.duration} onChange={(duration) => update({ duration })} format={(d) => `${d}s`} />
          </Field>
        </div>
      )}
    </NodeShell>
  );
}

function UpscaleNode({ id, data, selected }: P) {
  const update = useUpdate(id);
  const gallery = data.gallery ?? [];
  return (
    <NodeShell id={id} kind="upscale" data={data} selected={selected} runLabel="Upscale" width={300}>
      <Gallery items={gallery} selectedId={data.outputs?.images?.[0]?.id} onSelect={(m) => update({ outputs: { images: [m] } })} empty="Conecte uma imagem e rode o upscale" />
      <Field label="Escala">
        <Chips options={[2, 4]} value={data.scale} onChange={(scale) => update({ scale })} format={(s) => `${s}x`} />
      </Field>
      <Field label={`Criatividade · ${(data.creativity ?? 0.35).toFixed(2)}`}>
        <input
          type="range"
          className="range nodrag"
          min={0}
          max={1}
          step={0.05}
          value={data.creativity ?? 0.35}
          onChange={(e) => update({ creativity: Number(e.target.value) })}
        />
      </Field>
      <input className="field nodrag" placeholder="Prompt de apoio (opcional)" value={data.prompt ?? ""} onChange={(e) => update({ prompt: e.target.value })} />
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
