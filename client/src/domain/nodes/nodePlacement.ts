import {
  CHILD_HORIZONTAL_GAP,
  RECT_HEIGHT,
  RECT_WIDTH,
  SIBLING_VERTICAL_GAP,
} from "@/config/shapes";
import type { Node } from "@/types/node";

function createNode(id: number, parentId: number | null, x: number, y: number): Node {
  return {
    id,
    parentId,
    x,
    y,
    width: RECT_WIDTH,
    height: RECT_HEIGHT,
    label: "",
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
  const parent = nodes.find((node) => node.id === parentId);
  if (!parent) return null;

  const siblings = nodes.filter((node) => node.parentId === parentId);
  const y = siblings.length === 0
    ? parent.y
    : Math.max(...siblings.map((node) => node.y + node.height)) + SIBLING_VERTICAL_GAP;

  return createNode(id, parentId, parent.x + parent.width + CHILD_HORIZONTAL_GAP, y);
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
