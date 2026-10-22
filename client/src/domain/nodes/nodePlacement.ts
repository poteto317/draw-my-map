import {
  RECT_HEIGHT,
  RECT_WIDTH,
  SIBLING_VERTICAL_GAP,
} from "@/config/shapes";
import type { Node } from "@/types/node";
import { DEFAULT_NODE_IMPORTANCE } from "@/domain/nodes/nodeImportance";
import { calculateChildPlacement } from "@/domain/nodes/nodeManualPlacement";

function createNode(id: number, parentId: number | null, x: number, y: number): Node {
  return {
    id,
    parentId,
    x,
    y,
    width: RECT_WIDTH,
    height: RECT_HEIGHT,
    label: "",
    importance: DEFAULT_NODE_IMPORTANCE,
  };
}

export function createRootNode(id: number, centerX: number, centerY: number): Node {
  return createNode(id, null, centerX - RECT_WIDTH / 2, centerY - RECT_HEIGHT / 2);
}

export function createChildNode(
  nodes: readonly Node[],
  parentId: number,
  id: number,
): Node | null {
  const placement = calculateChildPlacement(nodes, parentId);
  if (!placement) return null;

  return createNode(id, parentId, placement.x, placement.y);
}

export function createSiblingNode(
  nodes: readonly Node[],
  sourceId: number,
  id: number,
): Node | null {
  const source = nodes.find((node) => node.id === sourceId);
  if (!source) return null;

  const siblings = nodes.filter((node) => node.parentId === source.parentId);
  const y = Math.max(...siblings.map((node) => node.y + node.height)) + SIBLING_VERTICAL_GAP;

  return createNode(id, source.parentId, source.x, y);
}
