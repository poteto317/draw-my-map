"use client";

import { useMapJsonExport } from "@/hooks/useMapJsonExport";
import { useMapJsonImport } from "@/hooks/useMapJsonImport";
import type { MapDocumentResult } from "@/types/mapDocument";
import type { NodeMapState } from "@/types/nodeMapState";
import type { PersistenceNotice } from "@/types/persistence";

type UseMapFilePersistenceOptions = {
  currentSnapshot: string;
  replaceMap: (state: NodeMapState) => void;
  requestSnapshotSave: (snapshot: string) => void;
  publishNotice: (notice: PersistenceNotice) => void;
  downloadJson?: (json: string) => void;
  readFile?: (file: File) => Promise<MapDocumentResult<string>>;
};

export function useMapFilePersistence({
  currentSnapshot,
  replaceMap,
  requestSnapshotSave,
  publishNotice,
  downloadJson,
  readFile,
}: UseMapFilePersistenceOptions) {
  const exportJson = useMapJsonExport({
    currentSnapshot,
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
