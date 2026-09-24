import { getMapExportBounds } from "@/domain/imageExport/mapExportBounds";
import {
  createMapSvgDocument,
  type MapSvgDocument,
} from "@/domain/imageExport/mapSvgDocument";
import { createMapTextMeasurer } from "@/services/imageExport/mapTextMeasurement";
import type { Node } from "@/types/node";

export function createMapSvgExport(nodes: readonly Node[]): MapSvgDocument | null {
  if (nodes.length === 0) return null;

  const measureText = createMapTextMeasurer();
  const bounds = getMapExportBounds(nodes, measureText);
  if (!bounds) return null;

  return createMapSvgDocument(nodes, bounds, measureText);
}
