"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  mapName: string;
  publishNotice: (notice: OperationNotice) => void;
  createSvgExport?: CreateSvgExport;
  rasterizePng?: RasterizePng;
  downloadPng?: DownloadImage;
};

export function useMapPngExport({
  nodes,
  mapName,
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
  const mountedRef = useRef(false);

  // StrictModeの二重実行でも、再セットアップで true に戻す
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const exportPng = useCallback(async () => {
    if (exportingPngRef.current) return;

    // 変換中にマップ名が変わっても、書き出しを始めた時点の名前を使う
    const exportMapName = mapName;
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
      if (!mountedRef.current) return;
      downloadPng(pngBlob, createMapImageFileName("png", exportMapName));
      publishNotice({
        kind: "status",
        message: "PNGファイルを書き出しました。",
      });
    } catch {
      if (!mountedRef.current) return;
      publishNotice({
        kind: "error",
        message: "PNGファイルを書き出せませんでした。",
      });
    } finally {
      exportingPngRef.current = false;
      if (mountedRef.current) setIsExportingPng(false);
    }
  }, [createSvgExport, downloadPng, mapName, nodes, publishNotice, rasterizePng]);

  return { exportPng, isExportingPng };
}
