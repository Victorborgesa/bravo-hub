import { motion, AnimatePresence } from "motion/react";
import { Plus, X, Play, Square } from "lucide-react";
import { useRef } from "react";
import { useActiveSpace, useSpaces } from "../store/spaces";
import { AspectPicker, Field, FullModelSelect, MediaView, OptionPicker, Stepper, useInspector } from "./nodes/controls";
import { NodeIcon } from "./nodes/icons";
import { NODE_SPECS, type NodeOutputs } from "./ports";
import { AUTO_ID, modelById, resolveModel } from "../providers/catalog";
import { cancelNode, runNode } from "./engine";
import { importFiles } from "./nodes";
import { drawer } from "../lib/motion";

const MAX_REFS = 8;

/** Painel lateral com todas as configurações do node selecionado. */
export function Inspector() {
  const { nodeId, open } = useInspector();
  const space = useActiveSpace();
  const { updateNode, addNode, onConnect } = useSpaces();
  const fileInput = useRef<HTMLInputElement>(null);
  const node = space?.nodes.find((n) => n.id === nodeId);
  const kind = node?.type;
  const show = !!node && (kind === "image" || kind === "video" || kind === "assistant" || kind === "upscale");

  // Imagens que chegam pelas conexões de entrada.
  const refs = !node || !space
    ? []
    : space.edges
        .filter((e) => e.target === node.id && e.targetHandle === "in-image")
        .flatMap((e) => (space.nodes.find((n) => n.id === e.source)?.data.outputs as NodeOutputs | undefined)?.images ?? []);

  async function addReferences(files: File[]) {
    if (!node) return;
    const added = await importFiles(files);
    if (!added.length) return;
    const uploadId = addNode("upload", { x: node.position.x - 360, y: node.position.y + 40 * refs.length }, { gallery: added, outputs: { images: added } });
    onConnect({ source: uploadId, sourceHandle: "out-image", target: node.id, targetHandle: "in-image" });
    useSpaces.getState().onNodesChange([{ type: "select", id: node.id, selected: true }, { type: "select", id: uploadId, selected: false }]);
  }

  const update = (patch: Parameters<typeof updateNode>[1]) => node && updateNode(node.id, patch);
  const d = node?.data;
  const cap = kind === "image" ? "image" : kind === "video" ? "video" : "text";
  const model = d?.modelId === AUTO_ID ? resolveModel(AUTO_ID, cap, refs.length > 0) : modelById(d?.modelId ?? "");
  const running = d?.status === "running";

  return (
    <AnimatePresence>
      {show && node && d && (
        <motion.aside
          key="inspector"
          className="inspector"
          {...drawer}
        >
          <header className="inspector-head">
            <NodeIcon kind={kind!} size={15} />
            <span>{NODE_SPECS[kind!].title} #{d.seq ?? 1}</span>
            <button className="icon-btn" onClick={() => open(null)}><X size={16} /></button>
          </header>

          <div className="inspector-body">
            {kind !== "upscale" && (
              <Field label="Modelo" aside={d.modelId === AUTO_ID && model ? `Auto → ${model.label}` : undefined}>
                <FullModelSelect capability={cap} value={d.modelId} onChange={(modelId) => update({ modelId })} />
              </Field>
            )}

            {(kind === "image" || kind === "video") && (
              <Field label={kind === "image" ? "Referências" : "Quadro inicial"} aside={`${refs.length}/${kind === "image" ? MAX_REFS : 1}`}>
                <div className="ref-grid">
                  {refs.slice(0, MAX_REFS).map((r) => (
                    <div key={r.id} className="ref-slot filled"><MediaView media={r} /></div>
                  ))}
                  {refs.length < (kind === "image" ? MAX_REFS : 1) && (
                    <button className="ref-slot" onClick={() => fileInput.current?.click()}>
                      <Plus size={16} />
                      <span>Adicionar</span>
                    </button>
                  )}
                </div>
                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => addReferences(Array.from(e.target.files ?? []))} />
              </Field>
            )}

            <Field label={kind === "assistant" ? "Instrução" : kind === "upscale" ? "Prompt de apoio" : "Prompt"}>
              <textarea className="field area" rows={6} placeholder={kind === "image" ? "Descreva a imagem que você deseja gerar…" : "Escreva aqui…"} value={d.prompt ?? ""} onChange={(e) => update({ prompt: e.target.value })} />
            </Field>

            <div className="inspector-row">
              {kind === "image" && (
                <>
                  <Stepper value={d.count ?? 1} onChange={(count) => update({ count })} />
                  <AspectPicker options={model?.aspects ?? ["1:1", "16:9", "9:16"]} value={d.aspect} onChange={(aspect) => update({ aspect })} />
                </>
              )}
              {kind === "video" && (
                <>
                  <AspectPicker options={model?.aspects ?? ["16:9", "9:16"]} value={d.aspect} onChange={(aspect) => update({ aspect })} />
                  <OptionPicker options={(model?.durations ?? [4, 6, 8]).map((v) => ({ value: v }))} value={d.duration} onChange={(duration) => update({ duration })} format={(v) => `${v}s`} />
                </>
              )}
              {kind === "upscale" && (
                <OptionPicker options={[{ value: 2 }, { value: 4 }]} value={d.scale} onChange={(scale) => update({ scale })} format={(v) => `${v}x`} />
              )}
            </div>

            {model && (
              <p className="inspector-note">
                Custo estimado: ~US$ {model.price.usd} por {model.price.unit}
                {model.note ? ` · ${model.note}` : ""}
              </p>
            )}
          </div>

          <footer className="inspector-foot">
            {running ? (
              <button className="btn btn-block" onClick={() => cancelNode(node.id)}><Square size={13} /> Parar</button>
            ) : (
              <button className="btn btn-primary btn-block" onClick={() => runNode(node.id)}><Play size={14} /> Iniciar</button>
            )}
          </footer>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
