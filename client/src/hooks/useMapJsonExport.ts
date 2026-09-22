"use client";

import { useCallback } from "react";
import { downloadMapJson } from "@/services/persistence/mapJsonDownload";
import type { PersistenceNotice } from "@/types/persistence";

type UseMapJsonExportOptions = {
  currentSnapshot: string;
  publishNotice: (notice: PersistenceNotice) => void;
  downloadJson?: (json: string) => void;
};

export function useMapJsonExport({
  currentSnapshot,
  publishNotice,
  downloadJson = downloadMapJson,
}: UseMapJsonExportOptions): () => void {
  return useCallback(() => {
    try {
      downloadJson(currentSnapshot);
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
  }, [currentSnapshot, downloadJson, publishNotice]);
}
