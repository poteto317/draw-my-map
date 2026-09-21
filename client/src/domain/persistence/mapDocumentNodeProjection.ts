import type { Node } from "@/types/node";

export function projectMapDocumentNode(node: Node): Node {
  return {
    id: node.id,
    parentId: node.parentId,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    label: node.label,
  };
}
