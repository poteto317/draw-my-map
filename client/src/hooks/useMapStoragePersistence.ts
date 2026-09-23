"use client";

import { useMapStorageAutoSave } from "@/hooks/useMapStorageAutoSave";
import { useMapStorageRestoration } from "@/hooks/useMapStorageRestoration";
import type { NodeMapState } from "@/types/nodeMapState";
import type { OperationNotice } from "@/types/operationNotice";

type MapStorage = Pick<Storage, "getItem" | "setItem">;

type UseMapStoragePersistenceOptions = {
  currentSnapshot: string;
  replaceMap: (state: NodeMapState) => void;
  publishNotice: (notice: OperationNotice) => void;
  storage?: MapStorage;
};

export function useMapStoragePersistence({
  currentSnapshot,
  replaceMap,
  publishNotice,
  storage,
}: UseMapStoragePersistenceOptions) {
  const restoration = useMapStorageRestoration({
    currentSnapshot,
    replaceMap,
    publishNotice,
    storage,
  });

  return useMapStorageAutoSave({
    currentSnapshot,
    hydrated: restoration.hydrated,
    initialPersistedSnapshot: restoration.initialPersistedSnapshot,
    publishNotice,
    storage,
  });
}
