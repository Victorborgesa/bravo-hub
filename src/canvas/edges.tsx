import { BaseEdge, getBezierPath, useStore, type EdgeProps, type EdgeTypes } from "@xyflow/react";
import { handleType } from "./ports";

/** Conexão curva colorida pelo tipo de dado; anima o fluxo enquanto o destino gera. */
function TypedEdge({ id, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, sourceHandleId, selected }: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 });
  const running = useStore((s) => s.nodeLookup.get(target)?.data?.status === "running");
  const type = handleType(sourceHandleId) ?? "text";
  return (
    <>
      <BaseEdge id={id} path={path} className={`typed-edge edge-${type} ${selected ? "is-selected" : ""}`} />
      {running && <path d={path} className={`edge-flow edge-${type}`} fill="none" />}
    </>
  );
}

export const edgeTypes: EdgeTypes = { typed: TypedEdge };
