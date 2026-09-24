"use client";

import { useCallback } from "react";
import { createMapSvgExport } from "@/services/imageExport/createMapSvgExport";
import { createMapImageFileName } from "@/services/imageExport/mapImageFileName";
import { downloadMapImage } from "@/services/imageExport/mapImageDownload";
import { createMapSvgBlob } from "@/services/imageExport/mapSvgArtifact";
import type { CreateSvgExport, DownloadImage } from "@/types/mapImageExport";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

type UseMapSvgExportOptions = {
  nodes: readonly Node[];
  publishNotice: (notice: OperationNotice) => void;
  createSvgExport?: CreateSvgExport;
  downloadSvg?: DownloadImage;
};

export function useMapSvgExport({
  nodes,
  publishNotice,
  createSvgExport = createMapSvgExport,
  downloadSvg = downloadMapImage,
}: UseMapSvgExportOptions): () => void {
  return useCallback(() => {
    try {
      const svgExport = createSvgExport(nodes);
      if (!svgExport) {
        publishNotice({
          kind: "warning",
          message: "書き出すノードがありません。",
        });
        return;
      }

      downloadSvg(
        createMapSvgBlob(svgExport.svg),
        createMapImageFileName("svg"),
      );
      publishNotice({
        kind: "status",
        message: "SVGファイルを書き出しました。",
      });
    } catch {
      publishNotice({
        kind: "error",
        message: "SVGファイルを書き出せませんでした。",
      });
    }
  }, [createSvgExport, downloadSvg, nodes, publishNotice]);
}
