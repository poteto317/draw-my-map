import { getEdgeCurve } from "@/components/map/mapGeometry";
import type { MapExportBounds } from "@/domain/imageExport/mapExportBounds";
import {
  getMapExportLabel,
  type MeasureMapText,
  wrapMapExportText,
} from "@/domain/imageExport/mapExportText";
import type { Node } from "@/types/node";

export type MapSvgDocument = {
  svg: string;
  width: number;
  height: number;
};

const MAP_EXPORT_FONT_SIZE = 14;
const MAP_EXPORT_LINE_HEIGHT = 18;
const MAP_EXPORT_HORIZONTAL_INSET = 8;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function createMapSvgDocument(
  nodes: readonly Node[],
  bounds: MapExportBounds,
  measureText: MeasureMapText,
): MapSvgDocument {
  const nodesById = new Map<number, Node>();
  for (const node of nodes) {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node);
  }

  const background = `<rect width="${bounds.width}" height="${bounds.height}" fill="#ffffff" />`;
  const edges: string[] = [];
  const rectangles: string[] = [];
  const labels: string[] = [];

  for (const child of nodes) {
    if (child.parentId === null) continue;
    const parent = nodesById.get(child.parentId);
    if (!parent) continue;

    const curve = getEdgeCurve(parent, child);
    edges.push(
      `<path d="M ${curve.start.x + bounds.offsetX} ${curve.start.y + bounds.offsetY} C ${curve.control1.x + bounds.offsetX} ${curve.control1.y + bounds.offsetY} ${curve.control2.x + bounds.offsetX} ${curve.control2.y + bounds.offsetY} ${curve.end.x + bounds.offsetX} ${curve.end.y + bounds.offsetY}" fill="none" stroke="#64748b" stroke-width="2" />`,
    );
  }

  for (const node of nodes) {
    rectangles.push(
      `<rect x="${node.x + bounds.offsetX}" y="${node.y + bounds.offsetY}" width="${node.width}" height="${node.height}" fill="#ffffff" stroke="#3b82f6" stroke-width="2" />`,
    );

    const centerX = node.x + bounds.offsetX + node.width / 2;
    const centerY = node.y + bounds.offsetY + node.height / 2;
    const lines = wrapMapExportText(
      getMapExportLabel(node.label),
      node.width - MAP_EXPORT_HORIZONTAL_INSET * 2,
      measureText,
    );
    const firstBaseline = centerY
      - ((lines.length - 1) * MAP_EXPORT_LINE_HEIGHT) / 2
      + MAP_EXPORT_FONT_SIZE / 3;
    const tspans = lines.map((line, index) => (
      `<tspan x="${centerX}" y="${firstBaseline + index * MAP_EXPORT_LINE_HEIGHT}">${escapeXml(line)}</tspan>`
    )).join("");
    labels.push(
      `<text text-anchor="middle" font-size="${MAP_EXPORT_FONT_SIZE}" fill="#27272a">${tspans}</text>`,
    );
  }

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">${background}${edges.join("")}${rectangles.join("")}${labels.join("")}</svg>`,
    width: bounds.width,
    height: bounds.height,
  };
}
