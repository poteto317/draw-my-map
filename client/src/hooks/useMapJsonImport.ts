"use client";

import { useCallback, useEffect, useRef } from "react";
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
  const mountedRef = useRef(false);

  // StrictModeの二重実行でも、再セットアップで true に戻す
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return useCallback(async (file: File) => {
    const importRevision = latestImportRevisionRef.current + 1;
    latestImportRevisionRef.current = importRevision;
    // アンマウントした後や、後から別のファイルを選んだ後の読み取り結果は捨てる
    const isStale = () => !mountedRef.current || importRevision !== latestImportRevisionRef.current;
    // 失敗では現在のマップを変えないので、そのことを理由に続けて伝える
    const publishFailure = (reason: string) => {
      publishNotice({ kind: "error", message: `${reason}${IMPORT_PRESERVED_MESSAGE}` });
    };

    let read: MapDocumentResult<string>;
    try {
      read = await readFile(file);
    } catch {
      if (!isStale()) publishFailure("JSONファイルを読み取れませんでした。");
      return;
    }

    if (isStale()) return;

    if (!read.ok) {
      publishFailure(read.error);
      return;
    }

    const parsed = parseMapDocumentJson(read.value);
    if (!parsed.ok) {
      publishFailure(parsed.error);
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
