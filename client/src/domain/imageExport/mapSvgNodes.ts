import type { MapExportBounds } from "@/domain/imageExport/mapExportBounds";
import {
  getMapExportTextLayout,
  MAP_EXPORT_FONT_SIZE,
  MAP_EXPORT_HORIZONTAL_INSET,
  MAP_EXPORT_LINE_HEIGHT,
  type MeasureMapText,
} from "@/domain/imageExport/mapExportText";
import { escapeMapXmlText } from "@/domain/imageExport/mapXmlText";
import { isIllustrationDataUrl } from "@/domain/illustration/illustrationDataUrl";
import { getNodeIllustrationRect, getNodeLabelCenterOffset } from "@/domain/nodes/nodeIllustration";
import type { Node } from "@/types/node";

export type MapSvgNodeMarkup = {
  rectangles: string;
  images: string;
  labels: string;
};

function createNodeRectMarkup(node: Node, bounds: MapExportBounds): string {
  return `<rect x="${node.x + bounds.offsetX}" y="${node.y + bounds.offsetY}" width="${node.width}" height="${node.height}" fill="#ffffff" stroke="#3b82f6" stroke-width="2" />`;
}

function createNodeImageMarkup(node: Node, bounds: MapExportBounds): string | null {
  if (node.illustration === undefined || !isIllustrationDataUrl(node.illustration)) return null;

  const rect = getNodeIllustrationRect(node);
  return `<image href="${node.illustration}" xlink:href="${node.illustration}" x="${rect.x + bounds.offsetX}" y="${rect.y + bounds.offsetY}" width="${rect.size}" height="${rect.size}" />`;
}

function createNodeLabelMarkup(node: Node, bounds: MapExportBounds, measureText: MeasureMapText): string {
  const centerX = node.x + bounds.offsetX + node.width / 2;
  const layout = getMapExportTextLayout(
    node.label,
    node.width - MAP_EXPORT_HORIZONTAL_INSET * 2,
    node.y + bounds.offsetY + getNodeLabelCenterOffset(node),
    measureText,
  );
  const tspans = layout.lines.map((line, index) => (
    `<tspan x="${centerX}" y="${layout.firstBaseline + index * MAP_EXPORT_LINE_HEIGHT}">${escapeMapXmlText(line)}</tspan>`
  )).join("");
  return `<text xml:space="preserve" text-anchor="middle" font-size="${MAP_EXPORT_FONT_SIZE}" font-family="Arial, Helvetica, sans-serif" fill="#27272a">${tspans}</text>`;
}

export function createMapSvgNodes(
  nodes: readonly Node[],
  bounds: MapExportBounds,
  measureText: MeasureMapText,
): MapSvgNodeMarkup {
  const rectangles: string[] = [];
  const images: string[] = [];
  const labels: string[] = [];

  for (const node of nodes) {
    rectangles.push(createNodeRectMarkup(node, bounds));
    const image = createNodeImageMarkup(node, bounds);
    if (image !== null) images.push(image);
    labels.push(createNodeLabelMarkup(node, bounds, measureText));
  }

  return { rectangles: rectangles.join(""), images: images.join(""), labels: labels.join("") };
}
