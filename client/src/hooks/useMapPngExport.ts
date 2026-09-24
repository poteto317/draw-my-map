"use client";

import { useCallback, useRef, useState } from "react";
import { createMapSvgExport } from "@/services/imageExport/createMapSvgExport";
import { createMapImageFileName } from "@/services/imageExport/mapImageFileName";
import { downloadMapImage } from "@/services/imageExport/mapImageDownload";
import { rasterizeMapSvgToPng } from "@/services/imageExport/mapPngRasterizer";
import type {
  CreateSvgExport,
  DownloadImage,
  RasterizePng,
} from "@/types/mapImageExport";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

type UseMapPngExportOptions = {
  nodes: readonly Node[];
  publishNotice: (notice: OperationNotice) => void;
  createSvgExport?: CreateSvgExport;
  rasterizePng?: RasterizePng;
  downloadPng?: DownloadImage;
};

export function useMapPngExport({
  nodes,
  publishNotice,
  createSvgExport = createMapSvgExport,
  rasterizePng = rasterizeMapSvgToPng,
  downloadPng = downloadMapImage,
}: UseMapPngExportOptions): {
  exportPng: () => Promise<void>;
  isExportingPng: boolean;
} {
  const [isExportingPng, setIsExportingPng] = useState(false);
  const exportingPngRef = useRef(false);

  const exportPng = useCallback(async () => {
    if (exportingPngRef.current) return;

    exportingPngRef.current = true;
    setIsExportingPng(true);
    try {
      const svgExport = createSvgExport(nodes);
      if (!svgExport) {
        publishNotice({
          kind: "warning",
          message: "書き出すノードがありません。",
        });
        return;
      }

      const pngBlob = await rasterizePng(
        svgExport.svg,
        svgExport.width,
        svgExport.height,
      );
      downloadPng(pngBlob, createMapImageFileName("png"));
      publishNotice({
        kind: "status",
        message: "PNGファイルを書き出しました。",
      });
    } catch {
      publishNotice({
        kind: "error",
        message: "PNGファイルを書き出せませんでした。",
      });
    } finally {
      exportingPngRef.current = false;
      setIsExportingPng(false);
    }
  }, [createSvgExport, downloadPng, nodes, publishNotice, rasterizePng]);

  return { exportPng, isExportingPng };
}
