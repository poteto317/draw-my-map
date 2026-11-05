"use client";

import { useCallback, useMemo, useState } from "react";
import { isAutoSaveFailedNotice } from "@/domain/mapLibrary/mapLibraryMessages";
import { createMapDocument, serializeMapDocument } from "@/domain/persistence/mapDocumentCodec";
import type { MapSaveStatus } from "@/domain/persistence/mapSaveStatus";
import { useMapFilePersistence } from "@/hooks/useMapFilePersistence";
import { useMapStoragePersistence } from "@/hooks/useMapStoragePersistence";
import type { MapDocumentResult } from "@/types/mapDocument";
import type { MapStorageSession } from "@/types/mapStorageSession";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { NodeMapState } from "@/types/nodeMapState";
import type { OperationNotice } from "@/types/operationNotice";

type UseMapPersistenceOptions = {
  nodes: readonly Node[];
  layoutMode: NodeLayoutMode;
  replaceMap: (state: NodeMapState) => void;
  storageSession: MapStorageSession;
  storageMode: "persistent" | "protected";
  mapName: string;
  downloadJson?: (json: string, mapName: string) => void;
  readFile?: (file: File) => Promise<MapDocumentResult<string>>;
};

type UseMapPersistenceResult = {
  exportJson: () => void;
  importJsonFile: (file: File) => Promise<void>;
  notice: OperationNotice | null;
  saveStatus: MapSaveStatus;
};

export function useMapPersistence({
  nodes,
  layoutMode,
  replaceMap,
  storageSession,
  storageMode,
  mapName,
  downloadJson,
  readFile,
}: UseMapPersistenceOptions): UseMapPersistenceResult {
  const [notice, setNotice] = useState<OperationNotice | null>(null);
  const currentSnapshot = useMemo(
    () => serializeMapDocument(createMapDocument(nodes, layoutMode)),
    [nodes, layoutMode],
  );
  // 自動保存の失敗の通知だけを消し、ほかの通知は残す
  const clearSaveFailureNotice = useCallback(() => {
    setNotice((current) => (isAutoSaveFailedNotice(current) ? null : current));
  }, []);
  const { requestSnapshotSave, saveStatus } = useMapStoragePersistence({
    currentSnapshot,
    replaceMap,
    publishNotice: setNotice,
    storageSession,
    storageMode,
    clearSaveFailureNotice,
  });
  const { exportJson, importJsonFile } = useMapFilePersistence({
    currentSnapshot,
    mapName,
    replaceMap,
    requestSnapshotSave,
    publishNotice: setNotice,
    downloadJson,
    readFile,
  });

  return { exportJson, importJsonFile, notice, saveStatus };
}
