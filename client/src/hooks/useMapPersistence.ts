"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ConflictState } from "@/domain/mapLibrary/mapConflict";
import { isAutoSaveFailedNotice } from "@/domain/mapLibrary/mapLibraryMessages";
import {
  createMapDocument,
  parseMapDocumentJsonWithVersion,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import type { MapSaveStatus } from "@/domain/persistence/mapSaveStatus";
import { useMapConflictController } from "@/hooks/useMapConflictController";
import { useMapFilePersistence } from "@/hooks/useMapFilePersistence";
import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";
import { useMapStoragePersistence } from "@/hooks/useMapStoragePersistence";
import type { MapDocumentResult, MapDocumentV3 } from "@/types/mapDocument";
import type { MapStorageSession } from "@/types/mapStorageSession";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { NodeMapState } from "@/types/nodeMapState";
import type { OperationNotice } from "@/types/operationNotice";

export interface UseMapPersistenceOptions {
  nodes: readonly Node[];
  layoutMode: NodeLayoutMode;
  replaceMap: (state: NodeMapState) => void;
  storageSession: MapStorageSession;
  storageMode: "persistent" | "protected";
  mapName: string;
  downloadJson?: (json: string, mapName: string) => void;
  readFile?: (file: File) => Promise<MapDocumentResult<string>>;
  conflictState?: ConflictState;
  onWriteConflict?: () => void;
  onSaveCurrentAsNewMap?: (name: string, snapshotJson: string) => MapLibraryOperationResult;
}

export interface UseMapPersistenceResult {
  exportJson: () => void;
  importJsonFile: (file: File) => Promise<void>;
  notice: OperationNotice | null;
  saveStatus: MapSaveStatus;
  hasPendingEdits: boolean;
  rebaseSnapshot: (snapshotJson: string) => void;
  conflictState: ConflictState;
  isConfirmOpen: boolean;
  conflictActionNotice: OperationNotice | null;
  handleSaveAsCopy: () => void;
  handleReloadExternal: () => void;
  handleConfirmReload: () => void;
  handleCancelConfirm: () => void;
}

export function useMapPersistence({
  nodes,
  layoutMode,
  replaceMap,
  storageSession,
  storageMode,
  mapName,
  downloadJson,
  readFile,
  conflictState: externalConflictState,
  onWriteConflict: externalOnWriteConflict,
  onSaveCurrentAsNewMap,
}: UseMapPersistenceOptions): UseMapPersistenceResult {
  const [notice, setNotice] = useState<OperationNotice | null>(null);
  const currentSnapshot = useMemo(
    () => serializeMapDocument(createMapDocument(nodes, layoutMode)),
    [nodes, layoutMode],
  );

  const canonicalInitialSnapshot = useMemo(() => {
    const read = storageSession.readBody();
    if (!read.ok || read.value === null) return null;
    const parsed = parseMapDocumentJsonWithVersion(read.value);
    return parsed.ok ? serializeMapDocument(parsed.value.document) : null;
  }, [storageSession]);

  const [confirmedSnapshot, setConfirmedSnapshot] = useState<string | null>(
    () => canonicalInitialSnapshot ?? currentSnapshot,
  );

  const hydratedRef = useRef(false);
  const rebaseSnapshotRef = useRef<(snapshotJson: string) => void>(() => {});

  const conflictController = useMapConflictController({
    storageSession,
    nodes,
    layoutMode,
    mapName,
    getHasPendingEdits: () => (
      !hydratedRef.current && canonicalInitialSnapshot !== null
        ? false
        : confirmedSnapshot !== null && currentSnapshot !== confirmedSnapshot
    ),
    replaceMapAndReset: replaceMap as (document: MapDocumentV3) => void,
    onSaveCurrentAsNewMap,
    rebaseSnapshot: (json) => {
      setConfirmedSnapshot(json);
      rebaseSnapshotRef.current(json);
    },
  });

  const effectiveConflictState = externalConflictState ?? conflictController.conflictState;
  const effectiveOnWriteConflict = externalOnWriteConflict ?? conflictController.onWriteConflict;

  // 自動保存の失敗の通知だけを消し、ほかの通知は残す
  const clearSaveFailureNotice = useCallback(() => {
    setNotice((current) => (isAutoSaveFailedNotice(current) ? null : current));
  }, []);

  const {
    requestSnapshotSave,
    saveStatus,
    hydrated,
    restoreOrigin,
    hasSavedBodyThisMount,
    rebaseSnapshot,
  } = useMapStoragePersistence({
    currentSnapshot,
    replaceMap,
    publishNotice: setNotice,
    storageSession,
    storageMode,
    clearSaveFailureNotice,
    conflictState: effectiveConflictState,
    onWriteConflict: effectiveOnWriteConflict,
    onSaveSuccess: (snapshot) => {
      setConfirmedSnapshot(snapshot);
    },
  });

  useLayoutEffect(() => {
    hydratedRef.current = hydrated;
  }, [hydrated]);

  // 初回マウント時、ストレージに既存データがあるがまだ復元前（!hydrated）の場合は未保存編集とはみなさない
  const isPendingRestoration = !hydrated && canonicalInitialSnapshot !== null;
  const hasPendingEdits =
    !isPendingRestoration && confirmedSnapshot !== null && currentSnapshot !== confirmedSnapshot;

  useLayoutEffect(() => {
    rebaseSnapshotRef.current = rebaseSnapshot;
  }, [rebaseSnapshot]);

  useLayoutEffect(
    () => storageSession.registerBackupSnapshot(() => ({
      json: currentSnapshot,
      hydrated,
      restoreOrigin,
      hasSavedBodyThisMount: hasSavedBodyThisMount(),
    })),
    [currentSnapshot, hydrated, restoreOrigin, hasSavedBodyThisMount, storageSession],
  );

  const { exportJson, importJsonFile } = useMapFilePersistence({
    currentSnapshot,
    mapName,
    replaceMap,
    requestSnapshotSave,
    publishNotice: setNotice,
    downloadJson,
    readFile,
  });

  return {
    exportJson,
    importJsonFile,
    notice,
    saveStatus,
    hasPendingEdits,
    rebaseSnapshot,
    conflictState: effectiveConflictState,
    isConfirmOpen: conflictController.isConfirmOpen,
    conflictActionNotice: conflictController.conflictActionNotice,
    handleSaveAsCopy: conflictController.handleSaveAsCopy,
    handleReloadExternal: conflictController.handleReloadExternal,
    handleConfirmReload: conflictController.handleConfirmReload,
    handleCancelConfirm: conflictController.handleCancelConfirm,
  };
}
