import { getEdgeCurve } from "@/components/map/mapGeometry";
import type { MapVisibilityTarget } from "@/components/map/pixi/mapVisibilityAnimator";
import { edgeVisibilityKey } from "@/components/map/pixi/mapVisibilityKeys";
import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import { createEdgeVisibilityTarget } from "@/components/map/pixi/pixiVisibilityTarget";
import { HIGHLIGHT_DIM_ALPHA } from "@/domain/nodes/highlightSets";
import type { Node } from "@/types/node";
import type { Container } from "pixi.js";

function resolveEdgeAlpha(
  isVisible: boolean,
  parentId: number,
  childId: number,
  highlightNodeIds: ReadonlySet<number>,
): number {
  if (!isVisible) return 0;
  if (highlightNodeIds.size === 0) return 1;
  const bothHighlighted = highlightNodeIds.has(parentId) && highlightNodeIds.has(childId);
  return bothHighlighted ? 1 : HIGHLIGHT_DIM_ALPHA;
}

export function renderMapEdges(
  stage: Container,
  constructors: Pick<PixiConstructors, "Graphics">,
  nodes: readonly Node[],
  visibleKeys: ReadonlySet<string> | undefined,
  highlightNodeIds: ReadonlySet<number>,
): Map<string, MapVisibilityTarget> {
  const visibilityTargets = new Map<string, MapVisibilityTarget>();
  const nodesById = new Map<number, Node>();
  for (const node of nodes) {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node);
  }

  for (const child of nodes) {
    if (child.parentId === null) continue;
    const parent = nodesById.get(child.parentId);
    if (!parent) continue;

    const key = edgeVisibilityKey(child.id);
    const isVisible = visibleKeys?.has(key) ?? true;
    const curve = getEdgeCurve(parent, child);
    const edge = new constructors.Graphics();
    edge.alpha = resolveEdgeAlpha(isVisible, parent.id, child.id, highlightNodeIds);
    edge.visible = isVisible;
    edge.eventMode = "none";
    edge.moveTo(curve.start.x, curve.start.y).bezierCurveTo(
      curve.control1.x,
      curve.control1.y,
      curve.control2.x,
      curve.control2.y,
      curve.end.x,
      curve.end.y,
    ).stroke({ width: 2, color: 0x64748b });
    stage.addChild(edge);
    visibilityTargets.set(key, createEdgeVisibilityTarget(key, edge));
  }

  return visibilityTargets;
}
