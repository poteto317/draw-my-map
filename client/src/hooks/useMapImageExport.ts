"use client";

import { useCallback, useRef, useState } from "react";
import { getMapExportBounds } from "@/domain/imageExport/mapExportBounds";
import {
  createMapSvgDocument,
  type MapSvgDocument,
} from "@/domain/imageExport/mapSvgDocument";
import {
  createMapImageFileName,
  createMapSvgBlob,
  downloadMapImage,
} from "@/services/imageExport/mapImageDownload";
import { rasterizeMapSvgToPng } from "@/services/imageExport/mapPngRasterizer";
import { createMapTextMeasurer } from "@/services/imageExport/mapTextMeasurement";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

type CreateSvgExport = (nodes: readonly Node[]) => MapSvgDocument | null;
type DownloadImage = (blob: Blob, fileName: string) => void;
type RasterizePng = (
  svg: string,
  width: number,
  height: number,
) => Promise<Blob>;

type UseMapImageExportOptions = {
  nodes: readonly Node[];
  createSvgExport?: CreateSvgExport;
  downloadSvg?: DownloadImage;
  rasterizePng?: RasterizePng;
  downloadPng?: DownloadImage;
};

type UseMapImageExportResult = {
  exportSvg: () => void;
  exportPng: () => Promise<void>;
  isExportingPng: boolean;
  notice: OperationNotice | null;
};

function createDefaultSvgExport(nodes: readonly Node[]): MapSvgDocument | null {
  const bounds = getMapExportBounds(nodes);
  if (!bounds) return null;

  return createMapSvgDocument(nodes, bounds, createMapTextMeasurer());
}

const EMPTY_MAP_NOTICE: OperationNotice = {
  kind: "warning",
  message: "書き出すノードがありません。",
};

export function useMapImageExport({
  nodes,
  createSvgExport = createDefaultSvgExport,
  downloadSvg = downloadMapImage,
  rasterizePng = rasterizeMapSvgToPng,
  downloadPng = downloadMapImage,
}: UseMapImageExportOptions): UseMapImageExportResult {
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [notice, setNotice] = useState<OperationNotice | null>(null);
  const exportingPngRef = useRef(false);

  const exportSvg = useCallback(() => {
    try {
      const svgExport = createSvgExport(nodes);
      if (!svgExport) {
        setNotice(EMPTY_MAP_NOTICE);
        return;
      }

      downloadSvg(
        createMapSvgBlob(svgExport.svg),
        createMapImageFileName("svg"),
      );
      setNotice({
        kind: "status",
        message: "SVGファイルを書き出しました。",
      });
    } catch {
      setNotice({
        kind: "error",
        message: "SVGファイルを書き出せませんでした。",
      });
    }
  }, [createSvgExport, downloadSvg, nodes]);

  const exportPng = useCallback(async () => {
    if (exportingPngRef.current) return;

    exportingPngRef.current = true;
    setIsExportingPng(true);
    try {
      const svgExport = createSvgExport(nodes);
      if (!svgExport) {
        setNotice(EMPTY_MAP_NOTICE);
        return;
      }

      const pngBlob = await rasterizePng(
        svgExport.svg,
        svgExport.width,
        svgExport.height,
      );
      downloadPng(pngBlob, createMapImageFileName("png"));
      setNotice({
        kind: "status",
        message: "PNGファイルを書き出しました。",
      });
    } catch {
      setNotice({
        kind: "error",
        message: "PNGファイルを書き出せませんでした。",
      });
    } finally {
      exportingPngRef.current = false;
      setIsExportingPng(false);
    }
  }, [createSvgExport, downloadPng, nodes, rasterizePng]);

  return { exportSvg, exportPng, isExportingPng, notice };
}
