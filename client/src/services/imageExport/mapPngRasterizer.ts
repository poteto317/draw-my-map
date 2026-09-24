import { withLoadedMapSvgImage } from "@/services/imageExport/loadMapSvgImage";
import { createMapPngEncoder } from "@/services/imageExport/mapCanvasPngEncoder";

export async function rasterizeMapSvgToPng(
  svg: string,
  width: number,
  height: number,
): Promise<Blob> {
  const encode = createMapPngEncoder(width, height);
  return withLoadedMapSvgImage(svg, encode);
}
