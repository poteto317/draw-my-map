import { projectLabelTextStyle } from "@/domain/nodes/labelTextStyle";
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
    importance: node.importance,
    ...(node.illustration === undefined ? {} : { illustration: node.illustration }),
    ...(node.note === undefined ? {} : { note: node.note }),
    ...(node.links === undefined ? {} : { links: node.links }),
    ...(node.tags === undefined ? {} : { tags: node.tags }),
    ...(node.sources === undefined ? {} : { sources: node.sources }),
    ...(node.mapLinks === undefined ? {} : { mapLinks: node.mapLinks }),
    ...(node.locked === undefined ? {} : { locked: node.locked }),
    ...projectLabelTextStyle(node),
  };
}
