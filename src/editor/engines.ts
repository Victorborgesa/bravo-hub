// Motores, prontos e montagem do pedido do Editor, portados do Modify AI 7.11
// (plugin de Photoshop da Bravo). Os textos dos prontos e dos blocos de
// integração são os mesmos do plugin, que já foram testados no dia a dia.

export type EngineKind = "generate" | "inpaint";

export interface Tier {
  field: string;
  label: string;
  values: string[];
  def: string;
  costs?: Record<string, number>;
  /** Menor saída que ainda cobre a área enviada: [lado maior até, valor]. */
  auto?: [number, string][];
}

export interface EditEngine {
  id: string;
  name: string;
  family: string;
  hint: string;
  kind: EngineKind;
  model: string;
  imagesField?: string;
  aspectRatios?: string[];
  outputFormat?: string;
  multiImageField?: string;
  tier?: Tier;
  /** Aceita imagens de exemplo (referências). */
  references: boolean;
  costPerImage: number | null;
}

const NB_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const SD_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"];
const GPT_RATIOS = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"];
const NB_TIER: Tier = { field: "resolution", label: "Saída", values: ["1K", "2K", "4K"], def: "2K", auto: [[1100, "1K"], [2200, "2K"], [1e9, "4K"]] };
const GPT_TIER: Tier = { field: "quality", label: "Qualidade", values: ["low", "medium", "high", "xhigh", "max"], def: "low", costs: { low: 0.03, medium: 0.05, high: 0.08, xhigh: 0.14, max: 0.22 } };

export const ENGINES: EditEngine[] = [
  { id: "nb2", name: "Nano Banana 2", family: "Nano Banana (Google)", hint: "Rápida e equilibrada. A escolha segura do dia a dia.", kind: "generate", model: "google/nano-banana-2", references: true, aspectRatios: NB_RATIOS, tier: NB_TIER, costPerImage: 0.05 },
  { id: "nb2-lite", name: "Nano Banana 2 Lite", family: "Nano Banana (Google)", hint: "A mais barata. Boa para testar a ideia antes de gastar mais.", kind: "generate", model: "google/nano-banana-2-lite", references: true, aspectRatios: NB_RATIOS, costPerImage: 0.02 },
  { id: "nb-pro", name: "Nano Banana Pro", family: "Nano Banana (Google)", hint: "A mais caprichosa da família. Para o que vai ao cliente.", kind: "generate", model: "google/nano-banana-pro", references: true, aspectRatios: NB_RATIOS, tier: NB_TIER, costPerImage: 0.14 },
  { id: "sd5-pro", name: "Seedream 5 Pro", family: "Seedream (ByteDance)", hint: "Forte para criar. Ao editar, mande mais cena e não amplie demais.", kind: "generate", model: "bytedance/seedream-5-pro", references: true, aspectRatios: SD_RATIOS, outputFormat: "png", tier: { field: "size", label: "Saída", values: ["1K", "2K"], def: "2K", costs: { "1K": 0.045, "2K": 0.09 }, auto: [[1100, "1K"], [1e9, "2K"]] }, costPerImage: 0.09 },
  { id: "sd5-lite", name: "Seedream 5 Lite", family: "Seedream (ByteDance)", hint: "A versão leve, com saída em 3K.", kind: "generate", model: "bytedance/seedream-5-lite", references: true, aspectRatios: SD_RATIOS, outputFormat: "png", tier: { field: "size", label: "Saída", values: ["2K", "3K"], def: "2K", auto: [[2200, "2K"], [1e9, "3K"]] }, costPerImage: null },
  { id: "gpt25-flare", name: "GPT Image 2.5 Flare", family: "ChatGPT (OpenAI)", hint: "Rápida, com sete proporções.", kind: "generate", model: "openai/gpt-image-2.5-flare", imagesField: "input_images", references: true, aspectRatios: GPT_RATIOS, outputFormat: "png", multiImageField: "number_of_images", tier: GPT_TIER, costPerImage: 0.05 },
  { id: "gpt25-sunburst", name: "GPT Image 2.5 Sunburst", family: "ChatGPT (OpenAI)", hint: "A mais detalhista da família, com o melhor acabamento.", kind: "generate", model: "openai/gpt-image-2.5-sunburst", imagesField: "input_images", references: true, aspectRatios: GPT_RATIOS, outputFormat: "png", multiImageField: "number_of_images", tier: GPT_TIER, costPerImage: 0.05 },
  { id: "flux-fill", name: "Flux Fill (só dentro da seleção)", family: "Flux (Black Forest)", hint: "Vê a cena e só pode desenhar DENTRO da seleção. Não aceita exemplo.", kind: "inpaint", model: "black-forest-labs/flux-fill-pro", references: false, costPerImage: 0.05 },
  { id: "flux-kontext-max", name: "Flux Kontext Max", family: "Flux (Black Forest)", hint: "Boa em preservar o resto da cena ao editar um trecho.", kind: "generate", model: "black-forest-labs/flux-kontext-max", imagesField: "input_image", references: false, costPerImage: 0.08 },
];

export const engineById = (id?: string) => ENGINES.find((e) => e.id === id) ?? ENGINES[0];
export const FAMILIES = [...new Set(ENGINES.map((e) => e.family))];

export function engineCost(e: EditEngine, tierValue?: string): number | null {
  if (e.tier?.costs && tierValue && e.tier.costs[tierValue] != null) return e.tier.costs[tierValue];
  return e.costPerImage;
}

export function tierForSize(tier: Tier, longest: number): string {
  for (const [max, value] of tier.auto ?? []) if (longest <= max) return value;
  return tier.def;
}

export function nearestAspect(ratios: string[], target: number): string {
  let best = ratios[0];
  let bestD = Infinity;
  for (const r of ratios) {
    const [w, h] = r.split(":").map(Number);
    // Escala logarítmica: 3:2 e 2:3 ficam simétricos.
    const d = Math.abs(Math.log(w / h) - Math.log(target));
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Prontos: [nome, tarefa em inglês, tipo de integração]

type Integration = "inserir" | "remover" | "alterar" | "luz" | "livre";

export const ACTIONS: Record<string, [string, string, Integration][]> = {
  "Prompt livre": [],
  Retoque: [
    ["Remover pessoa", "Remove the person described and rebuild the background behind them.", "remover"],
    ["Remover objeto", "Remove the object described and rebuild the background behind it.", "remover"],
    ["Limpar imagem", "Clean up the distractions and imperfections described, leaving the surfaces clean with their original texture.", "remover"],
    ["Corrigir vegetação", "Fix or complete the vegetation described so it looks healthy, dense and natural for this climate and season.", "inserir"],
    ["Corrigir arquitetura", "Correct only the architectural element described, keeping its proportions, alignment and materials true to the rest of the building.", "alterar"],
  ],
  Pessoas: [
    ["Adicionar pessoas", "Add the people described, as natural candid figures that belong in this space.", "inserir"],
    ["Alterar roupa", "Change only the clothing of the person described; keep their face, hair, skin, body and pose identical.", "alterar"],
    ["Remover pessoa", "Remove only the person described and rebuild the background behind them.", "remover"],
    ["Ajustar pose", "Adjust only the pose described; keep the person's identity, clothing and position in the scene.", "alterar"],
    ["Melhorar realismo", "Make the people described look like real photographed people: natural skin texture, believable fabric folds, relaxed posture.", "alterar"],
  ],
  Ambiente: [
    ["Alterar céu", "Replace only the sky as described.", "luz"],
    ["Alterar horário", "Change the time of day and lighting conditions as described.", "luz"],
    ["Blue hour", "Turn the scene into early blue hour, just after sunset: deep blue sky around 9,000 K, soft directionless ambient light, interior and landscape lights on at 2,700-3,000 K glowing warm against the blue.", "luz"],
    ["Golden hour", "Turn the scene into golden hour: the sun about 8 degrees above the horizon at around 3,000 K, raking from the side; long soft-edged shadows; sky fill around 5,500 K lifting the shadows; warm highlights on facades and glass.", "luz"],
    ["Melhorar iluminação", "Improve the lighting while keeping its direction and logic: richer contrast, natural falloff, a photographic look.", "luz"],
    ["Adicionar iluminação artificial", "Add the artificial lighting described, emitted from real fixtures, with a believable color temperature, spill and glow.", "luz"],
  ],
  Arquitetura: [
    ["Corrigir fachada", "Correct only the facade described, keeping its volume, proportions and alignment.", "alterar"],
    ["Alterar material", "Change only the material described; keep the geometry, joints and texture scale consistent with the real size of the surface.", "alterar"],
    ["Adicionar paisagismo", "Add the landscaping described, with species and sizes suited to the site and climate.", "inserir"],
    ["Remover elemento", "Remove only the architectural element described and rebuild what was behind it.", "remover"],
    ["Completar construção", "Complete the construction as described, in the same architectural language, materials and proportions.", "inserir"],
  ],
};

const INTEGRATION: Record<Integration, string> = {
  inserir:
    "INTEGRATION: Read this scene's key light -- its direction, color temperature and hardness -- and light everything you add with it. Skin and light-colored fabric pick up the color bounced from nearby surfaces. Add a soft contact shadow where it touches the floor and a cast shadow that follows the scene's light. Size it to real scale using doors (about 2.1 m), ceiling height and furniture; in an eye-level shot, the heads of standing adults sit close to the horizon line. Match the perspective, depth of field, sharpness, noise and color grading of the photo, so the added element is exactly as clean as the rest.",
  remover:
    "INTEGRATION: Rebuild the revealed area cleanly and sharply by continuing the surrounding lines, materials, patterns and perspective, with the same light and shadows as the area around it.",
  alterar:
    "INTEGRATION: Keep the element's geometry, position and perspective, and light the change with the scene's own light, so it reads as photographed together with the rest.",
  luz:
    "INTEGRATION: Keep every building, material and object exactly in place. Update everything the new light touches: shadow direction and length, reflections in glass and water, and the balance between daylight and artificial light.",
  livre:
    "INTEGRATION: Match this scene's light direction, color temperature and intensity, its perspective and lens, and its sharpness, noise and color grading. Anything added casts shadows consistent with the scene's light.",
};

const FOOTER =
  "KEEP: Everything outside the edit stays exactly as in the original -- framing, camera angle and lens, perspective, architecture, materials, colors, lighting and every person outside the edit. The result reads as one single, unretouched architectural photograph.";

/** Papel de cada imagem enviada: exemplos, guia de posição e a cena. */
function rolesText(n: number, guide = false) {
  const scene = n + (guide ? 2 : 1);
  if (!n && !guide) return "Edit this architectural photograph.";
  const parts = [`You receive ${scene} images.`];
  if (n === 1) parts.push("Image 1 is a REFERENCE for appearance only.");
  else if (n > 1) parts.push(`Images 1 to ${n} are REFERENCES for appearance only, each one a different subject.`);
  if (guide)
    parts.push(
      `Image ${n + 1} is a PLACEMENT GUIDE: the same scene with the edit area tinted red. Use it only to know where the edit goes; never copy the red tint.`,
    );
  parts.push(`Image ${scene} is the SCENE: an architectural photograph to edit.`);
  if (guide)
    parts.push(
      `Make the edit only inside the red area of image ${n + 1}, and size and arrange everything you add so that all of it -- whole bodies, feet and hands included -- fits inside that area.`,
    );
  parts.push("Return only the edited scene, clean, with no red tint.");
  return parts.join(" ");
}

function referenceText(n: number, guide = false) {
  if (!n) return "";
  const which = n === 1 ? "image 1" : `images 1 to ${n}`;
  const each = n === 1 ? "" : "Each reference is a different subject: give each one its own face, hair and clothing, exactly as in its own image. ";
  return `REFERENCE: From ${which} take only the appearance of what is requested -- face, hair, clothing, shape and color. ${each}Light it, place it and size it according to image ${n + (guide ? 2 : 1)}, so it looks photographed in that scene.`;
}

/** Papel das imagens, tarefa, pedido do usuário, integração e preservação, nessa ordem. */
export function composePrompt(category: string, action: string, instruction: string, refs: number, guide = false): string {
  const entry = ACTIONS[category]?.find((a) => a[0] === action);
  const base = entry?.[1] ?? "";
  const extra = instruction.trim();
  if (!base && !extra) return "";
  const parts = [rolesText(refs, guide)];
  if (base) parts.push(`TASK: ${base}`);
  if (extra) parts.push(`${base ? "DETAILS" : "TASK"} (written in Portuguese, follow it exactly): "${extra.replace(/"/g, "'")}"`);
  if (refs) parts.push(referenceText(refs, guide));
  parts.push(INTEGRATION[entry?.[2] ?? "livre"]);
  parts.push(FOOTER);
  return parts.join("\n\n");
}

/** Pedido escrito pelo diretor, com os papéis das imagens e a cláusula de preservação. */
export function wrapDirected(text: string, refs: number, inpaint: boolean, guide = false): string {
  if (inpaint) return text;
  return [rolesText(refs, guide), text, refs ? referenceText(refs, guide) : "", FOOTER].filter(Boolean).join("\n\n");
}

/** Tipo de integração do pronto escolhido (inserir, remover…). */
export const integrationOf = (category: string, action: string) => ACTIONS[category]?.find((a) => a[0] === action)?.[2] ?? "livre";

// ---------------------------------------------------------------------------
// Segmentador (Grounded SAM): só entende inglês.

export const SEGMENT_VERSION = "ee871c19efb1941f55f66a3d7d960428c8a5afcb77449547fe8e5a3ab9ebc21c";
export const SEGMENT_COST = 0.0032;
/** SAM 3: entende o pedido em inglês e devolve cada objeto em separado. */
export const SAM3_VERSION = "d73db077226443ba4fafd34e233b3626b552eac2a433f90c7c32a9ac89bd9e72";
export const SAM3_COST = 0.003;

const PT_EN: Record<string, string> = {
  pessoa: "person", pessoas: "people", gente: "people", mulher: "woman", mulheres: "women", homem: "man", homens: "men",
  menina: "girl", menino: "boy", crianca: "child", "criança": "child", criancas: "children", "crianças": "children",
  bebe: "baby", "bebê": "baby", casal: "couple", familia: "family", "família": "family", ciclista: "cyclist", pedestre: "pedestrian", figurante: "person",
  cachorro: "dog", cao: "dog", "cão": "dog", gato: "cat", passaro: "bird", "pássaro": "bird", cavalo: "horse",
  carro: "car", caminhao: "truck", "caminhão": "truck", onibus: "bus", "ônibus": "bus", bicicleta: "bicycle", moto: "motorcycle", barco: "boat",
  arvore: "tree", "árvore": "tree", arvores: "trees", "árvores": "trees", planta: "plant", plantas: "plants", flor: "flower", flores: "flowers",
  arbusto: "bush", grama: "grass", folhagem: "foliage", palmeira: "palm tree", vaso: "pot", jardim: "garden",
  cadeira: "chair", poltrona: "armchair", mesa: "table", sofa: "sofa", "sofá": "sofa", banco: "bench", cama: "bed",
  luminaria: "lamp", "luminária": "lamp", tapete: "rug", quadro: "painting", cortina: "curtain", espelho: "mirror",
  casa: "house", predio: "building", "prédio": "building", edificio: "building", "edifício": "building", janela: "window", porta: "door",
  escada: "stairs", piscina: "swimming pool", telhado: "roof", muro: "wall", parede: "wall", cerca: "fence", "portão": "gate", portao: "gate",
  varanda: "balcony", pergolado: "pergola", "guarda-sol": "umbrella", placa: "sign", poste: "pole", lixeira: "trash can",
  pedra: "rock", nuvem: "cloud", nuvens: "clouds", fonte: "fountain", escultura: "sculpture", "estátua": "statue", estatua: "statue",
};
/** Objetos que costumam ir na mão de quem é adicionado. */
const PROPS_PT: Record<string, string> = {
  vinho: "wine bottle", garrafa: "bottle", "taça": "wine glass", taca: "wine glass", copo: "glass", "café": "coffee cup", cafe: "coffee cup",
  xícara: "cup", xicara: "cup", bolsa: "bag", sacola: "shopping bag", mochila: "backpack", celular: "phone", livro: "book", jornal: "newspaper",
  "guarda-chuva": "umbrella", mala: "suitcase", carrinho: "stroller", bicicleta: "bicycle", cachorro: "dog", coleira: "leash", prancha: "surfboard",
  notebook: "laptop", tablet: "tablet", "buquê": "bouquet", flores: "flowers", "raquete": "racket", bola: "ball", bandeja: "tray",
};

export function propsFromText(text: string): string[] {
  const words = text.toLowerCase().split(/[^\p{L}-]+/u);
  return [...new Set(words.map((w) => PROPS_PT[w]).filter(Boolean))].slice(0, 3);
}

const STOP = new Set(["um", "uma", "uns", "umas", "o", "a", "os", "as", "de", "do", "da", "dos", "das", "e", "com"]);

export function translateObject(text: string): string {
  return text
    .toLowerCase()
    .split(",")
    .map((term) => {
      const t = term.trim();
      if (!t) return "";
      if (PT_EN[t]) return PT_EN[t];
      return t
        .split(/\s+/)
        .filter((w) => !STOP.has(w))
        .map((w) => PT_EN[w] || (w.length > 3 && w.endsWith("s") && PT_EN[w.slice(0, -1)]) || w)
        .join(" ");
    })
    .filter(Boolean)
    .join(", ");
}
