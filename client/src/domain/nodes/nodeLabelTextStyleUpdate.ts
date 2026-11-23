import {
  applyProjectedLabelTextStyle,
  resolveLabelBold,
  resolveLabelFontSize,
  resolveLabelUnderline,
  type LabelFontSize,
  type LabelTextStyleFields,
} from "@/domain/nodes/labelTextStyle";
import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import type { Node } from "@/types/node";

function updateNodeLabelTextStyle(
  nodes: readonly Node[],
  id: number,
  nextStyle: (target: Node) => LabelTextStyleFields | null,
): Node[] | null {
  const target = nodes.find((node) => node.id === id);
  if (target === undefined) return null;
  if (!assertNodesEditable([id], nodes).ok) return null;

  const style = nextStyle(target);
  if (style === null) return null;

  return nodes.map((node) => (
    node.id === id ? applyProjectedLabelTextStyle(node, style) : node
  ));
}

export function updateNodeLabelFontSize(
  nodes: readonly Node[],
  id: number,
  size: LabelFontSize,
): Node[] | null {
  return updateNodeLabelTextStyle(nodes, id, (target) => {
    if (resolveLabelFontSize(target) === size) return null;
    return {
      labelFontSize: size,
      labelBold: target.labelBold,
      labelUnderline: target.labelUnderline,
    };
  });
}

export function toggleNodeLabelBold(
  nodes: readonly Node[],
  id: number,
): Node[] | null {
  return updateNodeLabelTextStyle(nodes, id, (target) => {
    const nextBold = !resolveLabelBold(target);
    return {
      labelFontSize: target.labelFontSize,
      labelBold: nextBold ? true : undefined,
      labelUnderline: target.labelUnderline,
    };
  });
}

export function toggleNodeLabelUnderline(
  nodes: readonly Node[],
  id: number,
): Node[] | null {
  return updateNodeLabelTextStyle(nodes, id, (target) => {
    const nextUnderline = !resolveLabelUnderline(target);
    return {
      labelFontSize: target.labelFontSize,
      labelBold: target.labelBold,
      labelUnderline: nextUnderline ? true : undefined,
    };
  });
}
