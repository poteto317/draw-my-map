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

export function getMapExportBounds(
  nodes: readonly Node[],
  measureText: MeasureMapText,
  padding = MAP_EXPORT_PADDING,
): MapExportBounds | null {
  if (nodes.length === 0) return null;

  const extents = nodes.map((node) => {
    const centerX = node.x + node.width / 2;
    const layout = getMapExportTextLayout(
      node.label,
      node.width - MAP_EXPORT_HORIZONTAL_INSET * 2,
      node.y + node.height / 2,
      measureText,
    );

    return {
      left: Math.min(node.x, centerX - layout.width / 2),
      top: Math.min(node.y, layout.top),
      right: Math.max(node.x + node.width, centerX + layout.width / 2),
      bottom: Math.max(node.y + node.height, layout.bottom),
    };
  });
  const minX = Math.min(...extents.map(({ left }) => left));
  const minY = Math.min(...extents.map(({ top }) => top));
  const maxX = Math.max(...extents.map(({ right }) => right));
  const maxY = Math.max(...extents.map(({ bottom }) => bottom));

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
