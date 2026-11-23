import {
  getMapExportTextLayout,
  MAP_EXPORT_HORIZONTAL_INSET,
  resolveMapExportTextMeasureStyle,
  type MeasureMapText,
} from "@/domain/imageExport/mapExportText";
import {
  getNodeIconCenterX,
  NODE_ICON_DISPLAY_SIZE_PX,
} from "@/domain/nodes/nodeIcon";
import { getNodeLabelCenterOffset } from "@/domain/nodes/nodeIllustration";
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

function isRepresentable(value: number, expected: number): boolean {
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(expected)) * 4;
  return Math.abs(value - expected) <= tolerance;
}

function hasRepresentablePadding(
  min: number,
  max: number,
  offset: number,
  size: number,
  padding: number,
): boolean {
  const translatedMin = min + offset;
  const translatedMax = max + offset;
  return (
    isRepresentable(translatedMin, padding) &&
    isRepresentable(translatedMax, size - padding) &&
    (padding <= 0 || (translatedMin > 0 && translatedMax < size))
  );
}

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
  const centerY = node.illustration === undefined
    ? node.y / 2 + nodeBottom / 2
    : node.y + getNodeLabelCenterOffset(node);
  const layout = getMapExportTextLayout(
    node.label,
    node.width - MAP_EXPORT_HORIZONTAL_INSET * 2,
    centerY,
    measureText,
    resolveMapExportTextMeasureStyle(node),
  );

  let left = Math.min(node.x, centerX - layout.width / 2);
  let top = Math.min(node.y, layout.top);
  let right = Math.max(nodeRight, centerX + layout.width / 2);
  let bottom = Math.max(nodeBottom, layout.bottom);

  if (node.icon !== undefined) {
    const iconCenterX = getNodeIconCenterX(centerX, layout.width);
    const halfIcon = NODE_ICON_DISPLAY_SIZE_PX / 2;
    left = Math.min(left, iconCenterX - halfIcon);
    right = Math.max(right, iconCenterX + halfIcon);
    top = Math.min(top, centerY - halfIcon);
    bottom = Math.max(bottom, centerY + halfIcon);
  }

  return { left, top, right, bottom };
}

export function getMapExportBounds(
  nodes: readonly Node[],
  measureText: MeasureMapText,
  padding = MAP_EXPORT_PADDING,
): MapExportBounds | null {
  if (!Number.isFinite(padding) || padding < 0) {
    throw new RangeError(
      "Map export padding must be a non-negative finite number",
    );
  }

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

  if (
    !hasRepresentablePadding(minX, maxX, bounds.offsetX, bounds.width, padding) ||
    !hasRepresentablePadding(minY, maxY, bounds.offsetY, bounds.height, padding)
  ) {
    throw new RangeError("Map export bounds must be finite");
  }

  return bounds;
}
