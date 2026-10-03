import type { MapExportBounds } from "@/domain/imageExport/mapExportBounds";
import { type MeasureMapText } from "@/domain/imageExport/mapExportText";
import { createMapSvgEdges } from "@/domain/imageExport/mapSvgEdges";
import { createMapSvgNodes } from "@/domain/imageExport/mapSvgNodes";
import type { Node } from "@/types/node";

export type MapSvgDocument = {
  svg: string;
  width: number;
  height: number;
};

export function createMapSvgDocument(
  nodes: readonly Node[],
  bounds: MapExportBounds,
  measureText: MeasureMapText,
): MapSvgDocument {
  const background = `<rect width="${bounds.width}" height="${bounds.height}" fill="#ffffff" />`;
  const edges = createMapSvgEdges(nodes, bounds);
  const { rectangles, images, labels } = createMapSvgNodes(nodes, bounds, measureText);

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">${background}${edges}${rectangles}${images}${labels}</svg>`,
    width: bounds.width,
    height: bounds.height,
  };
}
