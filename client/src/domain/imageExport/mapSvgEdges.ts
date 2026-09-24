import type { MapExportBounds } from "@/domain/imageExport/mapExportBounds";
import { getNodeEdgeCurve } from "@/domain/nodes/nodeEdgeCurve";
import type { Node } from "@/types/node";

export function createMapSvgEdges(
  nodes: readonly Node[],
  bounds: MapExportBounds,
): string {
  const nodesById = new Map<number, Node>();
  for (const node of nodes) {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node);
  }

  const edges: string[] = [];
  for (const child of nodes) {
    if (child.parentId === null) continue;
    const parent = nodesById.get(child.parentId);
    if (!parent) continue;

    const curve = getNodeEdgeCurve(parent, child);
    edges.push(
      `<path d="M ${curve.start.x + bounds.offsetX} ${curve.start.y + bounds.offsetY} C ${curve.control1.x + bounds.offsetX} ${curve.control1.y + bounds.offsetY} ${curve.control2.x + bounds.offsetX} ${curve.control2.y + bounds.offsetY} ${curve.end.x + bounds.offsetX} ${curve.end.y + bounds.offsetY}" fill="none" stroke="#64748b" stroke-width="2" />`,
    );
  }

  return edges.join("");
}
