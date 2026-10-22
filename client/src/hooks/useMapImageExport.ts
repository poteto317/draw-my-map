"use client";

import { useState } from "react";
import { useMapPngExport } from "@/hooks/useMapPngExport";
import { useMapSvgExport } from "@/hooks/useMapSvgExport";
import type {
  CreateSvgExport,
  DownloadImage,
  RasterizePng,
} from "@/types/mapImageExport";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

type UseMapImageExportOptions = {
  nodes: readonly Node[];
  mapName: string;
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

export function useMapImageExport({
  nodes,
  mapName,
  createSvgExport,
  downloadSvg,
  rasterizePng,
  downloadPng,
}: UseMapImageExportOptions): UseMapImageExportResult {
  const [notice, setNotice] = useState<OperationNotice | null>(null);
  const exportSvg = useMapSvgExport({
    nodes,
    mapName,
    publishNotice: setNotice,
    createSvgExport,
    downloadSvg,
  });
  const { exportPng, isExportingPng } = useMapPngExport({
    nodes,
    mapName,
    publishNotice: setNotice,
    createSvgExport,
    rasterizePng,
    downloadPng,
  });

  return { exportSvg, exportPng, isExportingPng, notice };
}
