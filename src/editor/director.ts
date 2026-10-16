// Diretor de prompt: antes de gerar, um modelo de texto olha a cena (com a área
// marcada em destaque), lê a luz, a câmera e a escala, e escreve o pedido em
// inglês do jeito que cada motor entende melhor. O método vem da skill Image
// Creator da Bravo: física em vez de adjetivos, sujeito primeiro, pessoas com
// rosto e mãos resolvidos já no pedido.
import { generateText } from "../providers";
import { modelById } from "../providers/catalog";
import type { JobContext, ModelDef } from "../providers/types";
import type { MediaRef } from "../lib/media";
import { useCosts } from "../store/costs";
import { ACTIONS, type EditEngine } from "./engines";

const METHOD = `You are the director of photography and art director of Bravo Visuals, a Brazilian architectural visualization studio. You write the instruction that an image model will follow to make ONE LOCAL EDIT inside an existing architectural image (usually a 3D render of a real estate development, sometimes a photograph).

You receive the scene with the edit area tinted in translucent orange and outlined. The image model will receive the SAME scene WITHOUT the tint, so you must describe where the edit goes in scene terms (what surface, next to what, which part of the frame), never mention orange, tint, mask or overlay.

READ THE SCENE FIRST and turn what you see into physical decisions:
- Medium: photoreal render, photograph, or stylized. Match it: the edit must have the same sharpness, noise, render cleanliness and color grading. In a CG render, do not ask for film grain.
- Key light: source (sun, overcast sky, window, fixtures), direction (from camera-left/right, behind, front, and height in degrees), color temperature in Kelvin, hardness, and the direction and length of existing shadows.
- Camera: approximate lens height (the horizon line sits at lens height; eye-level shots put standing adults' heads near the horizon), perspective, lens feel (wide 18-24 mm, normal 35-50 mm).
- Scale anchors: doors (about 2.1 m), railings (about 1.1 m), steps (about 17 cm), cars, furniture. Use them to state the real size of what you add.

WRITE PHYSICS, NOT ADJECTIVES. Never use: cinematic, epic, beautiful, stunning, dramatic, moody, gorgeous, masterpiece, award-winning, hyperrealistic, ultra detailed, 4k, 8k, best quality. Say what must appear, in positive terms. Every word must carry visual weight. The subject comes in the first words.

WHEN ADDING PEOPLE:
- Number of people, apparent age, build, and a candid action that fits the place (walking with weight on the front leg, talking while holding a coffee cup, pushing a stroller, looking at a phone, sitting on a bench edge). Gaze direction. Nobody posing to camera unless asked.
- Exact placement on the surface they stand on, feet planted on that surface, real scale from the anchors, heads relative to the horizon line.
- Wardrobe from largest to smallest piece, with material and how it reacts to this light (linen catching the sun on the shoulders, dark denim absorbing the midtones). Dressed for the climate visible in the scene; plausible for a Brazilian urban development unless the scene says otherwise. Contemporary, unbranded.
- Face and hands woven into the same sentences, sized to how big the person is in frame: if the person is large, natural skin texture with pores on nose and cheekbones, defined lashes, stray hairs, five separated fingers with a clear gesture. If the person is small in frame, keep a clean readable silhouette, natural proportions, hands relaxed at the sides, in pockets or holding a simple object, and say that the face and hands stay crisp and clean.
- Light them with the scene's own key light and temperature; skin and light fabrics pick up bounce from nearby surfaces; a soft contact shadow under the feet and a cast shadow that follows the direction and length of the existing shadows.
- Natural imperfection: slight asymmetry, a garment crease, hair moved by wind.

FOR REMOVALS: describe what the revealed area becomes, continuing the surrounding materials, joints, patterns, perspective, light and shadows.
FOR LIGHT OR SKY CHANGES: state the new source, Kelvin, direction and what it updates (shadows, glass reflections, interior lights).
FOR MATERIAL OR ARCHITECTURE CHANGES: name the material, its finish, joint pattern and real-world scale, and keep geometry and perspective.

Follow the user's request exactly; it is written in Portuguese. Enrich only the gaps with coherent choices and never contradict or change the meaning of the request. No text, logos or watermarks unless asked.

OUTPUT: only the instruction text in English, no preamble, no quotes, no markdown, no headings, no lists. Then, on one final separate line, write PROPS: followed by the short English names of every object the added subjects hold, carry, push or lead (for example "PROPS: wine bottle, wine glass"), or "PROPS: none".`;

const FORMAT: Record<string, string> = {
  "Nano Banana (Google)":
    "TARGET MODEL: Nano Banana (Gemini image). Write a direct conversational edit instruction in 2 short paragraphs: first what to add or change and exactly where, with the physical details; then how it is lit and grounded in this scene. 600 to 1,100 characters.",
  "ChatGPT (OpenAI)":
    "TARGET MODEL: GPT Image. Write flowing prose in 1 or 2 paragraphs: what changes, where, the physical details, how it is lit and grounded, and include one ordinary imperfect detail. 700 to 1,200 characters.",
  "Seedream (ByteDance)":
    "TARGET MODEL: Seedream. Write concise direct prose: subject, placement, light direction, quality and source, materials named, natural imperfection. 400 to 800 characters.",
  "Flux (Black Forest)":
    "TARGET MODEL: Flux. Write a concise instruction describing what the edited area must contain, its light and how it meets the surroundings. 300 to 600 characters.",
};

/**
 * Ordem de tentativa. O Flash Lite responde em poucos segundos e escreve bem
 * esse tipo de texto; os outros ficam de reserva. Cada um tem 30 s: passou
 * disso, segue para o próximo em vez de travar a geração.
 */
const ATTEMPTS: { id: string; apiModel?: string; label?: string }[] = [
  { id: "gemini-flash", apiModel: "gemini-flash-lite-latest", label: "Gemini Flash Lite" },
  { id: "gemini-flash" },
  { id: "gpt-text" },
];
const ATTEMPT_MS = 30_000;

export interface DirectorInput {
  engine: EditEngine;
  category: string;
  action: string;
  instruction: string;
  references: number;
  /** O gerador também recebe a cena com a área pintada de vermelho. */
  guide?: boolean;
  /** Cena com a área marcada em destaque (JPEG). */
  scene: Blob;
}

/** Separa a linha PROPS (objetos nas mãos) do resto do pedido. */
export function splitProps(text: string): { text: string; props: string[] } {
  let props: string[] = [];
  const clean = text
    .split("\n")
    .filter((line) => {
      const m = line.trim().match(/^PROPS:\s*(.*)$/i);
      if (!m) return true;
      props = m[1].toLowerCase() === "none" ? [] : m[1].split(",").map((p) => p.trim().replace(/\.$/, "")).filter(Boolean);
      return false;
    })
    .join("\n")
    .trim();
  return { text: clean, props: props.slice(0, 3) };
}

export type Directed = { text: string; props: string[]; model: ModelDef } | { error: string };

export async function directPrompt(i: DirectorInput, ctx: JobContext): Promise<Directed> {
  const task = ACTIONS[i.category]?.find((a) => a[0] === i.action);
  const ask = [
    FORMAT[i.engine.family] ?? FORMAT["Nano Banana (Google)"],
    task ? `ACTION CHOSEN: ${task[0]} -- ${task[1]}` : "ACTION CHOSEN: free edit.",
    i.instruction.trim() ? `USER REQUEST (Portuguese): "${i.instruction.trim()}"` : "USER REQUEST: none beyond the action; decide the details yourself, keeping it simple and plausible.",
    i.references
      ? `The image model will also receive ${i.references} reference image(s) for appearance only (refer to them as "the reference image${i.references > 1 ? "s" : ""}"); keep identity and clothing from them, light and scale from the scene.`
      : "",
    i.guide
      ? "The image model also receives a black-and-white placement mask (white = the edit area, the same area you see tinted orange). Say that everything added stays inside the white area of the mask, and choose a number, pose and size of subjects that fits that area completely, feet and hands included."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const scene: MediaRef = { id: "director-scene", kind: "image", url: URL.createObjectURL(i.scene), mime: "image/jpeg", createdAt: Date.now() };
  let error = "nenhum modelo de texto disponível";
  try {
    for (const a of ATTEMPTS) {
      const base = modelById(a.id);
      if (!base) continue;
      const model: ModelDef = { ...base, ...(a.apiModel ? { apiModel: a.apiModel, label: a.label ?? base.label } : {}) };
      // Cancela esta tentativa sozinha depois do prazo, ou junto com o usuário.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ATTEMPT_MS);
      const relay = () => ctrl.abort();
      ctx.signal?.addEventListener("abort", relay, { once: true });
      try {
        const text = (await generateText({ model, system: METHOD, prompt: ask, images: [scene], fast: true }, { ...ctx, signal: ctrl.signal })).trim();
        if (text.length < 40) {
          error = `${model.label} respondeu vazio`;
          continue;
        }
        useCosts.getState().record(model, 0.003, true);
        const split = splitProps(text.replace(/^["'`]+|["'`]+$/g, ""));
        return { ...split, model };
      } catch (e) {
        if (ctx.signal?.aborted) throw e;
        error = ctrl.signal.aborted ? `${model.label} passou de ${ATTEMPT_MS / 1000}s` : `${model.label}: ${e instanceof Error ? e.message : e}`;
      } finally {
        clearTimeout(timer);
        ctx.signal?.removeEventListener("abort", relay);
      }
    }
    return { error };
  } finally {
    URL.revokeObjectURL(scene.url);
  }
}
