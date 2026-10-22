"use client";

import { useLayoutEffect } from "react";
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
  clearSaveFailureNotice: () => void;
};

export function useMapStoragePersistence({
  currentSnapshot,
  replaceMap,
  publishNotice,
  storageSession,
  clearSaveFailureNotice,
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
    publishNotice,
    writeBody: storageSession.writeBody,
    clearSaveFailureNotice,
  });
  const { flushPendingSave } = autoSave;

  // 切り替えなどの前に保存待ちを同期で書けるよう、セッションへ flush を登録する
  useLayoutEffect(
    () => storageSession.registerFlush(flushPendingSave),
    [flushPendingSave, storageSession],
  );

  return autoSave;
}
