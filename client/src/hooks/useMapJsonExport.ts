"use client";

import { useCallback } from "react";
import { downloadMapJson } from "@/services/persistence/mapJsonDownload";
import type { OperationNotice } from "@/types/operationNotice";

type UseMapJsonExportOptions = {
  currentSnapshot: string;
  mapName: string;
  publishNotice: (notice: OperationNotice) => void;
  downloadJson?: (json: string, mapName: string) => void;
};

export function useMapJsonExport({
  currentSnapshot,
  mapName,
  publishNotice,
  downloadJson = downloadMapJson,
}: UseMapJsonExportOptions): () => void {
  return useCallback(() => {
    try {
      downloadJson(currentSnapshot, mapName);
      publishNotice({
        kind: "status",
        message: "JSONファイルを書き出しました。",
      });
    } catch {
      publishNotice({
        kind: "error",
        message: "JSONファイルを書き出せませんでした。",
      });
    }
  }, [currentSnapshot, mapName, downloadJson, publishNotice]);
}
