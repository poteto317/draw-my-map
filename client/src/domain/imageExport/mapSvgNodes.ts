import type { MapExportBounds } from "@/domain/imageExport/mapExportBounds";
import {
  getMapExportLineHeight,
  getMapExportTextLayout,
  MAP_EXPORT_FONT_FAMILY,
  MAP_EXPORT_HORIZONTAL_INSET,
  resolveMapExportTextMeasureStyle,
  type MeasureMapText,
} from "@/domain/imageExport/mapExportText";
import { escapeMapXmlText } from "@/domain/imageExport/mapXmlText";
import { isIllustrationDataUrl } from "@/domain/illustration/illustrationDataUrl";
import { resolveLabelUnderline } from "@/domain/nodes/labelTextStyle";
import {
  getNodeIconCenterX,
  NODE_ICON_DISPLAY_SIZE_PX,
} from "@/domain/nodes/nodeIcon";
import { getNodeIllustrationRect, getNodeLabelCenterOffset } from "@/domain/nodes/nodeIllustration";
import type { Node } from "@/types/node";
import {
  NODE_KIND_BAR_FALLBACK_COLORS,
  NODE_KIND_BAR_WIDTH_PX,
} from "@/types/nodeKind";

export type MapSvgNodeMarkup = {
  rectangles: string;
  images: string;
  labels: string;
};

function createNodeRectMarkup(node: Node, bounds: MapExportBounds): string {
  return `<rect x="${node.x + bounds.offsetX}" y="${node.y + bounds.offsetY}" width="${node.width}" height="${node.height}" fill="#ffffff" stroke="#3b82f6" stroke-width="2" />`;
}

function createNodeKindBarMarkup(node: Node, bounds: MapExportBounds): string | null {
  if (node.kind === undefined) return null;
  const x = node.x + bounds.offsetX;
  const y = node.y + bounds.offsetY;
  const fill = NODE_KIND_BAR_FALLBACK_COLORS[node.kind];
  // glow なし（fill のみの rect）
  return `<rect x="${x}" y="${y}" width="${NODE_KIND_BAR_WIDTH_PX}" height="${node.height}" fill="${fill}" />`;
}

function createNodeImageMarkup(node: Node, bounds: MapExportBounds): string | null {
  if (node.illustration === undefined || !isIllustrationDataUrl(node.illustration)) return null;

  const rect = getNodeIllustrationRect(node);
  return `<image href="${node.illustration}" xlink:href="${node.illustration}" x="${rect.x + bounds.offsetX}" y="${rect.y + bounds.offsetY}" width="${rect.size}" height="${rect.size}" />`;
}

/** ラベル左の icon 文字。ラベル折り返しとは変更理由が異なるため分離 */
function createNodeIconMarkup(
  node: Node,
  bounds: MapExportBounds,
  layout: { centerX: number; width: number },
): string | null {
  if (node.icon === undefined) return null;
  const iconX = getNodeIconCenterX(layout.centerX, layout.width);
  const iconY = node.y + bounds.offsetY + getNodeLabelCenterOffset(node);
  return `<text text-anchor="middle" dominant-baseline="middle" font-size="${NODE_ICON_DISPLAY_SIZE_PX}" font-family="${MAP_EXPORT_FONT_FAMILY}" fill="#27272a" x="${iconX}" y="${iconY}">${escapeMapXmlText(node.icon)}</text>`;
}

function createNodeLabelMarkup(node: Node, bounds: MapExportBounds, measureText: MeasureMapText): string {
  const measureStyle = resolveMapExportTextMeasureStyle(node);
  const underline = resolveLabelUnderline(node);
  const lineHeight = getMapExportLineHeight(measureStyle.fontSize);
  const centerX = node.x + bounds.offsetX + node.width / 2;
  const layout = getMapExportTextLayout(
    node.label,
    node.width - MAP_EXPORT_HORIZONTAL_INSET * 2,
    node.y + bounds.offsetY + getNodeLabelCenterOffset(node),
    measureText,
    measureStyle,
  );
  const tspans = layout.lines.map((line, index) => (
    `<tspan x="${centerX}" y="${layout.firstBaseline + index * lineHeight}">${escapeMapXmlText(line)}</tspan>`
  )).join("");
  const weightAttr = measureStyle.bold ? ' font-weight="bold"' : "";
  const decorationAttr = underline ? ' text-decoration="underline"' : "";
  const labelMarkup = `<text xml:space="preserve" text-anchor="middle" font-size="${measureStyle.fontSize}"${weightAttr}${decorationAttr} font-family="${MAP_EXPORT_FONT_FAMILY}" fill="#27272a">${tspans}</text>`;
  const iconMarkup = createNodeIconMarkup(node, bounds, { centerX, width: layout.width });
  return iconMarkup === null ? labelMarkup : `${labelMarkup}${iconMarkup}`;
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
    const kindBar = createNodeKindBarMarkup(node, bounds);
    if (kindBar !== null) rectangles.push(kindBar);
    const image = createNodeImageMarkup(node, bounds);
    if (image !== null) images.push(image);
    labels.push(createNodeLabelMarkup(node, bounds, measureText));
  }

  return { rectangles: rectangles.join(""), images: images.join(""), labels: labels.join("") };
}
