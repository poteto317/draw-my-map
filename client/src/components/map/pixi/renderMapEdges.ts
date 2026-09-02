import { getEdgeCurve } from "@/components/map/mapGeometry";
import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import type { Node } from "@/types/node";
import type { Container, Graphics } from "pixi.js";

export function renderMapEdges(
  stage: Container,
  constructors: Pick<PixiConstructors, "Graphics">,
  nodes: readonly Node[],
): void {
  let edges: Graphics | null = null;
  const nodesById = new Map<number, Node>();
  for (const node of nodes) {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node);
  }

  for (const child of nodes) {
    if (child.parentId === null) continue;
    const parent = nodesById.get(child.parentId);
    if (!parent) continue;

    const curve = getEdgeCurve(parent, child);
    edges ??= new constructors.Graphics();
    edges.moveTo(curve.start.x, curve.start.y).bezierCurveTo(
      curve.control1.x,
      curve.control1.y,
      curve.control2.x,
      curve.control2.y,
      curve.end.x,
      curve.end.y,
    );
  }

  if (edges) {
    edges.stroke({ width: 2, color: 0x64748b });
    stage.addChild(edges);
  }
}
