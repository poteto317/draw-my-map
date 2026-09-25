import {
  getMapExportTextLayout,
  MAP_EXPORT_HORIZONTAL_INSET,
  type MeasureMapText,
} from "@/domain/imageExport/mapExportText";
import type { Node } from "@/types/node";

export type MapExportBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

export const MAP_EXPORT_PADDING = 32;

type MapExportExtent = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function getNodeExportExtent(
  node: Node,
  measureText: MeasureMapText,
): MapExportExtent {
  const nodeRight = node.x + node.width;
  const nodeBottom = node.y + node.height;
  if (
    !Number.isFinite(nodeRight) ||
    !Number.isFinite(nodeBottom) ||
    nodeRight <= node.x ||
    nodeBottom <= node.y
  ) {
    throw new RangeError("Map export bounds must be finite");
  }

  const centerX = node.x / 2 + nodeRight / 2;
  const layout = getMapExportTextLayout(
    node.label,
    node.width - MAP_EXPORT_HORIZONTAL_INSET * 2,
    node.y / 2 + nodeBottom / 2,
    measureText,
  );

  return {
    left: Math.min(node.x, centerX - layout.width / 2),
    top: Math.min(node.y, layout.top),
    right: Math.max(nodeRight, centerX + layout.width / 2),
    bottom: Math.max(nodeBottom, layout.bottom),
  };
}

export function getMapExportBounds(
  nodes: readonly Node[],
  measureText: MeasureMapText,
  padding = MAP_EXPORT_PADDING,
): MapExportBounds | null {
  if (nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const extent = getNodeExportExtent(node, measureText);
    minX = Math.min(minX, extent.left);
    minY = Math.min(minY, extent.top);
    maxX = Math.max(maxX, extent.right);
    maxY = Math.max(maxY, extent.bottom);
  }

  const bounds = {
    minX,
    minY,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
    offsetX: padding - minX,
    offsetY: padding - minY,
  };

  if (!Object.values(bounds).every(Number.isFinite)) {
    throw new RangeError("Map export bounds must be finite");
  }

  return bounds;
}
