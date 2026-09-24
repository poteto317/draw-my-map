import type { MapExportBounds } from "@/domain/imageExport/mapExportBounds";
import {
  getMapExportTextLayout,
  MAP_EXPORT_FONT_SIZE,
  MAP_EXPORT_HORIZONTAL_INSET,
  MAP_EXPORT_LINE_HEIGHT,
  type MeasureMapText,
} from "@/domain/imageExport/mapExportText";
import { escapeMapXmlText } from "@/domain/imageExport/mapXmlText";
import type { Node } from "@/types/node";

export type MapSvgNodeMarkup = {
  rectangles: string;
  labels: string;
};

export function createMapSvgNodes(
  nodes: readonly Node[],
  bounds: MapExportBounds,
  measureText: MeasureMapText,
): MapSvgNodeMarkup {
  const rectangles: string[] = [];
  const labels: string[] = [];

  for (const node of nodes) {
    rectangles.push(
      `<rect x="${node.x + bounds.offsetX}" y="${node.y + bounds.offsetY}" width="${node.width}" height="${node.height}" fill="#ffffff" stroke="#3b82f6" stroke-width="2" />`,
    );

    const centerX = node.x + bounds.offsetX + node.width / 2;
    const layout = getMapExportTextLayout(
      node.label,
      node.width - MAP_EXPORT_HORIZONTAL_INSET * 2,
      node.y + bounds.offsetY + node.height / 2,
      measureText,
    );
    const tspans = layout.lines.map((line, index) => (
      `<tspan x="${centerX}" y="${layout.firstBaseline + index * MAP_EXPORT_LINE_HEIGHT}">${escapeMapXmlText(line)}</tspan>`
    )).join("");
    labels.push(
      `<text text-anchor="middle" font-size="${MAP_EXPORT_FONT_SIZE}" font-family="Arial, Helvetica, sans-serif" fill="#27272a">${tspans}</text>`,
    );
  }

  return { rectangles: rectangles.join(""), labels: labels.join("") };
}
