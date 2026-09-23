"use client";

import { useCallback, useRef } from "react";
import { parseMapDocumentJson, serializeMapDocument } from "@/domain/persistence/mapDocumentCodec";
import { readMapJsonFile } from "@/services/persistence/mapJsonFileReader";
import type { MapDocumentResult } from "@/types/mapDocument";
import type { NodeMapState } from "@/types/nodeMapState";
import type { OperationNotice } from "@/types/operationNotice";

type UseMapJsonImportOptions = {
  replaceMap: (state: NodeMapState) => void;
  requestSnapshotSave: (snapshot: string) => void;
  publishNotice: (notice: OperationNotice) => void;
  readFile?: (file: File) => Promise<MapDocumentResult<string>>;
};

const IMPORT_PRESERVED_MESSAGE = "現在のマップは変更されていません。";

export function useMapJsonImport({
  replaceMap,
  requestSnapshotSave,
  publishNotice,
  readFile = readMapJsonFile,
}: UseMapJsonImportOptions): (file: File) => Promise<void> {
  const latestImportRevisionRef = useRef(0);

  return useCallback(async (file: File) => {
    const importRevision = latestImportRevisionRef.current + 1;
    latestImportRevisionRef.current = importRevision;
    let read: MapDocumentResult<string>;
    try {
      read = await readFile(file);
    } catch {
      if (importRevision !== latestImportRevisionRef.current) return;
      publishNotice({
        kind: "error",
        message: `JSONファイルを読み取れませんでした。${IMPORT_PRESERVED_MESSAGE}`,
      });
      return;
    }

    if (importRevision !== latestImportRevisionRef.current) return;

    if (!read.ok) {
      publishNotice({
        kind: "error",
        message: `${read.error}${IMPORT_PRESERVED_MESSAGE}`,
      });
      return;
    }

    const parsed = parseMapDocumentJson(read.value);
    if (!parsed.ok) {
      publishNotice({
        kind: "error",
        message: `${parsed.error}${IMPORT_PRESERVED_MESSAGE}`,
      });
      return;
    }

    const importedSnapshot = serializeMapDocument(parsed.value);
    requestSnapshotSave(importedSnapshot);
    replaceMap({
      layoutMode: parsed.value.layoutMode,
      nodes: parsed.value.nodes,
    });
    publishNotice({ kind: "status", message: "マップを読み込みました。" });
  }, [publishNotice, readFile, replaceMap, requestSnapshotSave]);
}
