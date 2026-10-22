"use client";

import { useMapJsonExport } from "@/hooks/useMapJsonExport";
import { useMapJsonImport } from "@/hooks/useMapJsonImport";
import type { MapDocumentResult } from "@/types/mapDocument";
import type { NodeMapState } from "@/types/nodeMapState";
import type { OperationNotice } from "@/types/operationNotice";

type UseMapFilePersistenceOptions = {
  currentSnapshot: string;
  mapName: string;
  replaceMap: (state: NodeMapState) => void;
  requestSnapshotSave: (snapshot: string) => void;
  publishNotice: (notice: OperationNotice) => void;
  downloadJson?: (json: string, mapName: string) => void;
  readFile?: (file: File) => Promise<MapDocumentResult<string>>;
};

export function useMapFilePersistence({
  currentSnapshot,
  mapName,
  replaceMap,
  requestSnapshotSave,
  publishNotice,
  downloadJson,
  readFile,
}: UseMapFilePersistenceOptions) {
  const exportJson = useMapJsonExport({
    currentSnapshot,
    mapName,
    publishNotice,
    downloadJson,
  });
  const importJsonFile = useMapJsonImport({
    replaceMap,
    requestSnapshotSave,
    publishNotice,
    readFile,
  });

  return { exportJson, importJsonFile };
}
