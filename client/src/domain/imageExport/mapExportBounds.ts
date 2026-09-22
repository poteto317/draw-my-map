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
  padding = MAP_EXPORT_PADDING,
): MapExportBounds | null {
  if (nodes.length === 0) return null;

  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));

  return {
    minX,
    minY,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
    offsetX: padding - minX,
    offsetY: padding - minY,
  };
}
