"use client";

import { useCallback, useLayoutEffect } from "react";
import type { ConflictState } from "@/domain/mapLibrary/mapConflict";
import { useMapStorageAutoSave } from "@/hooks/useMapStorageAutoSave";
import { useMapStorageRestoration } from "@/hooks/useMapStorageRestoration";
import type { MapStorageSession } from "@/types/mapStorageSession";
import type { NodeMapState } from "@/types/nodeMapState";
import type { OperationNotice } from "@/types/operationNotice";

type UseMapStoragePersistenceOptions = {
  currentSnapshot: string;
  replaceMap: (state: NodeMapState) => void;
  publishNotice: (notice: OperationNotice) => void;
  storageSession: MapStorageSession;
  storageMode: "persistent" | "protected";
  clearSaveFailureNotice: () => void;
  conflictState?: ConflictState;
  onWriteConflict?: () => void;
  onSaveSuccess?: (snapshot: string) => void;
};

export function useMapStoragePersistence({
  currentSnapshot,
  replaceMap,
  publishNotice,
  storageSession,
  storageMode,
  clearSaveFailureNotice,
  conflictState,
  onWriteConflict,
  onSaveSuccess,
}: UseMapStoragePersistenceOptions) {
  const restoration = useMapStorageRestoration({
    currentSnapshot,
    replaceMap,
    publishNotice,
    readBody: storageSession.readBody,
  });

  const autoSave = useMapStorageAutoSave({
    currentSnapshot,
    hydrated: restoration.hydrated,
    initialPersistedSnapshot: restoration.initialPersistedSnapshot,
    restoreOrigin: restoration.restoreOrigin,
    storageMode,
    publishNotice,
    writeBody: storageSession.writeBody,
    clearSaveFailureNotice,
    conflictState,
    onWriteConflict,
    onSaveSuccess,
  });
  const { flushPendingSave, rebaseConfirmedSnapshot } = autoSave;

  // 切り替えなどの前に保存待ちを同期で書けるよう、セッションへ flush を登録する
  useLayoutEffect(
    () => storageSession.registerFlush(flushPendingSave),
    [flushPendingSave, storageSession],
  );

  const rebaseSnapshot = useCallback(
    (snapshotJson: string) => {
      storageSession.rebaseSnapshot?.(snapshotJson);
      rebaseConfirmedSnapshot(snapshotJson);
    },
    [storageSession, rebaseConfirmedSnapshot],
  );

  return {
    ...autoSave,
    rebaseSnapshot,
    hydrated: restoration.hydrated,
    restoreOrigin: restoration.restoreOrigin,
  };
}
