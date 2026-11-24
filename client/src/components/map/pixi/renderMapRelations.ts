import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import { relationSegmentOutsideNodes } from "@/domain/map/relationSegmentGeometry";
import { RELATION_KIND_COLORS } from "@/domain/map/relationKindColors";
import { HIGHLIGHT_DIM_ALPHA } from "@/domain/nodes/highlightSets";
import type { MapRelation } from "@/types/mapRelation";
import type { Node } from "@/types/node";
import type { Container, FederatedPointerEvent, Graphics } from "pixi.js";

export type RenderMapRelationsOptions = {
  relations: readonly MapRelation[] | undefined;
  nodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
  highlightNodeIds: ReadonlySet<number>;
  selectedRelationId: number | null;
  onRelationPointerDown: (relationId: number, event: FederatedPointerEvent) => void;
};

function resolveRelationAlpha(
  fromId: number,
  toId: number,
  highlightNodeIds: ReadonlySet<number>,
): number {
  if (highlightNodeIds.size === 0) return 1;
  const both = highlightNodeIds.has(fromId) && highlightNodeIds.has(toId);
  return both ? 1 : HIGHLIGHT_DIM_ALPHA;
}

/** tip は end（対象ノード外周）。本体は外周の外側に描き、ノード描画の下に隠れない */
function drawArrowHead(
  graphics: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: number,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const ux = dx / length;
  const uy = dy / length;
  const size = 10;
  const tipX = to.x;
  const tipY = to.y;
  const leftX = tipX - ux * size + uy * (size * 0.45);
  const leftY = tipY - uy * size - ux * (size * 0.45);
  const rightX = tipX - ux * size - uy * (size * 0.45);
  const rightY = tipY - uy * size + ux * (size * 0.45);
  graphics
    .moveTo(tipX, tipY)
    .lineTo(leftX, leftY)
    .lineTo(rightX, rightY)
    .lineTo(tipX, tipY)
    .fill({ color });
}

/** 親子線と別。両端が visibleNodeIds に含まれるときのみ描画。ヒット有効。 */
export function renderMapRelations(
  stage: Container,
  constructors: Pick<PixiConstructors, "Graphics">,
  options: RenderMapRelationsOptions,
): void {
  const {
    relations,
    nodes,
    visibleNodeIds,
    highlightNodeIds,
    selectedRelationId,
    onRelationPointerDown,
  } = options;
  if (relations === undefined || relations.length === 0) return;

  const nodesById = new Map<number, Node>();
  for (const node of nodes) {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node);
  }

  for (const relation of relations) {
    if (!visibleNodeIds.has(relation.fromId) || !visibleNodeIds.has(relation.toId)) continue;
    const fromNode = nodesById.get(relation.fromId);
    const toNode = nodesById.get(relation.toId);
    if (fromNode === undefined || toNode === undefined) continue;

    const segment = relationSegmentOutsideNodes(fromNode, toNode);
    if (segment === null) continue;
    const { start: from, end: to } = segment;

    const color = RELATION_KIND_COLORS[relation.kind];
    const selected = selectedRelationId === relation.id;
    const strokeWidth = selected ? 4 : 2.5;
    const alpha = resolveRelationAlpha(relation.fromId, relation.toId, highlightNodeIds);

    const graphics = new constructors.Graphics();
    graphics.alpha = alpha;
    graphics.eventMode = "static";
    graphics.cursor = "pointer";
    // ヒット用の太めの透明線 → 可視ストローク
    graphics
      .moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ width: Math.max(12, strokeWidth + 8), color, alpha: 0.001 });
    graphics
      .moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ width: strokeWidth, color });
    if (relation.directed) {
      drawArrowHead(graphics, from, to, color);
    }
    graphics.on("pointerdown", (event: FederatedPointerEvent) => {
      event.stopPropagation();
      onRelationPointerDown(relation.id, event);
    });
    stage.addChild(graphics);
  }
}
