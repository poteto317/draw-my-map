"use client";

import { useMemo, useState } from "react";
import { createMapDocument, serializeMapDocument } from "@/domain/persistence/mapDocumentCodec";
import { useMapFilePersistence } from "@/hooks/useMapFilePersistence";
import { useMapStoragePersistence } from "@/hooks/useMapStoragePersistence";
import type { MapDocumentResult } from "@/types/mapDocument";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { NodeMapState } from "@/types/nodeMapState";
import type { PersistenceNotice } from "@/types/persistence";

type MapStorage = Pick<Storage, "getItem" | "setItem">;

type UseMapPersistenceOptions = {
  nodes: readonly Node[];
  layoutMode: NodeLayoutMode;
  replaceMap: (state: NodeMapState) => void;
  storage?: MapStorage;
  downloadJson?: (json: string) => void;
  readFile?: (file: File) => Promise<MapDocumentResult<string>>;
};

type UseMapPersistenceResult = {
  exportJson: () => void;
  importJsonFile: (file: File) => Promise<void>;
  notice: PersistenceNotice | null;
};

export function useMapPersistence({
  nodes,
  layoutMode,
  replaceMap,
  storage,
  downloadJson,
  readFile,
}: UseMapPersistenceOptions): UseMapPersistenceResult {
  const [notice, setNotice] = useState<PersistenceNotice | null>(null);
  const currentSnapshot = useMemo(
    () => serializeMapDocument(createMapDocument(nodes, layoutMode)),
    [nodes, layoutMode],
  );
  const { requestSnapshotSave } = useMapStoragePersistence({
    currentSnapshot,
    replaceMap,
    publishNotice: setNotice,
    storage,
  });
  const { exportJson, importJsonFile } = useMapFilePersistence({
    currentSnapshot,
    replaceMap,
    requestSnapshotSave,
    publishNotice: setNotice,
    downloadJson,
    readFile,
  });

  return { exportJson, importJsonFile, notice };
}
