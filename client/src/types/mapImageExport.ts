import type { MapSvgDocument } from "@/domain/imageExport/mapSvgDocument";
import type { Node } from "@/types/node";

export type CreateSvgExport = (nodes: readonly Node[]) => MapSvgDocument | null;
export type DownloadImage = (blob: Blob, fileName: string) => void;
export type RasterizePng = (
  svg: string,
  width: number,
  height: number,
) => Promise<Blob>;
