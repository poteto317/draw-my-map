import type { PixiConstructors } from "@/components/map/pixi/pixiTypes";
import type { Node } from "@/types/node";
import type { Container } from "pixi.js";

/** スクリーン上サイズ維持: ワールド半径 = max(MIN, CONST / scale) */
export const PRESENCE_MARKER_RADIUS_CONST = 3;
export const PRESENCE_MARKER_RADIUS_MIN = 2;

const PRESENCE_EDGE_STROKE_CONST = 1;
const PRESENCE_EDGE_STROKE_MIN = 0.5;

const PRESENCE_MARKER_COLOR = 0x64748b;

export type RenderPresenceMarkersOptions = {
  /** 表示座標（折りたたみ投影後） */
  nodes: readonly Node[];
  presenceNodeIds: ReadonlySet<number>;
  /** child id 配列のみ（keys 文字列は作らない） */
  presenceEdgeChildIds: readonly number[];
  scale: number;
};

/** edges は通常 nodes の前、markers（点）は通常 nodes の後に載せる */
export type PresenceMarkerLayers = {
  edges: Container;
  markers: Container;
};

export function presenceMarkerWorldRadius(scale: number): number {
  const safeScale = scale > 0 ? scale : 1;
  return Math.max(PRESENCE_MARKER_RADIUS_MIN, PRESENCE_MARKER_RADIUS_CONST / safeScale);
}

function presenceEdgeStrokeWidth(scale: number): number {
  const safeScale = scale > 0 ? scale : 1;
  return Math.max(PRESENCE_EDGE_STROKE_MIN, PRESENCE_EDGE_STROKE_CONST / safeScale);
}

function nodeCenter(node: Node): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function buildNodesById(nodes: readonly Node[]): Map<number, Node> {
  const nodesById = new Map<number, Node>();
  for (const node of nodes) {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node);
  }
  return nodesById;
}

/** 全 children eventMode none。ラベル無し。edge を先・点を後（線が点を覆わない） */
export function renderMapPresenceMarkers(
  constructors: PixiConstructors,
  options: RenderPresenceMarkersOptions,
): PresenceMarkerLayers {
  const edges = new constructors.Container();
  edges.eventMode = "none";
  const markers = new constructors.Container();
  markers.eventMode = "none";

  const nodesById = buildNodesById(options.nodes);

  // 1. edges 先（点を覆わない／scene では通常 nodes の前）
  const strokeWidth = presenceEdgeStrokeWidth(options.scale);
  for (const childId of options.presenceEdgeChildIds) {
    const child = nodesById.get(childId);
    if (!child || child.parentId === null) continue;
    const parent = nodesById.get(child.parentId);
    if (!parent) continue;
    const from = nodeCenter(parent);
    const to = nodeCenter(child);
    const edge = new constructors.Graphics();
    edge.eventMode = "none";
    edge.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({
      width: strokeWidth,
      color: PRESENCE_MARKER_COLOR,
    });
    edges.addChild(edge);
  }

  // 2. markers（点）後
  const radius = presenceMarkerWorldRadius(options.scale);
  for (const id of options.presenceNodeIds) {
    const node = nodesById.get(id);
    if (!node) continue;
    const center = nodeCenter(node);
    const marker = new constructors.Graphics();
    marker.eventMode = "none";
    marker.circle(center.x, center.y, radius).fill({ color: PRESENCE_MARKER_COLOR });
    markers.addChild(marker);
  }

  return { edges, markers };
}
