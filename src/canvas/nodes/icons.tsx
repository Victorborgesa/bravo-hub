import { Type, ListOrdered, Sparkles, Upload, Image, Clapperboard, Maximize2 } from "lucide-react";
import type { NodeKind } from "../ports";

const ICONS = {
  text: Type,
  list: ListOrdered,
  assistant: Sparkles,
  upload: Upload,
  image: Image,
  video: Clapperboard,
  upscale: Maximize2,
} satisfies Record<NodeKind, unknown>;

export function NodeIcon({ kind, size = 14 }: { kind: NodeKind; size?: number }) {
  const Icon = ICONS[kind];
  return <Icon size={size} strokeWidth={1.6} className="node-icon" />;
}
