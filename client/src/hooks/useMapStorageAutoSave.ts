"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { writeStoredMapJson } from "@/services/persistence/mapStorage";
import type { OperationNotice } from "@/types/operationNotice";

type WritableMapStorage = Pick<Storage, "setItem">;

type UseMapStorageAutoSaveOptions = {
  currentSnapshot: string;
  hydrated: boolean;
  initialPersistedSnapshot: string | null;
  publishNotice: (notice: OperationNotice) => void;
  storage?: WritableMapStorage;
};

type UseMapStorageAutoSaveResult = {
  requestSnapshotSave: (snapshot: string) => void;
};

export function useMapStorageAutoSave({
  currentSnapshot,
  hydrated,
  initialPersistedSnapshot,
  publishNotice,
  storage,
}: UseMapStorageAutoSaveOptions): UseMapStorageAutoSaveResult {
  const [saveRequestRevision, setSaveRequestRevision] = useState(0);
  const baselineInitializedRef = useRef(false);
  const lastPersistedSnapshotRef = useRef<string | null>(null);
  const forcedSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!baselineInitializedRef.current) {
      baselineInitializedRef.current = true;
      lastPersistedSnapshotRef.current = initialPersistedSnapshot;
    }

    const mustSaveCurrentSnapshot = forcedSnapshotRef.current === currentSnapshot;
    if (
      !mustSaveCurrentSnapshot
      && currentSnapshot === lastPersistedSnapshotRef.current
    ) return;

    const timer = window.setTimeout(() => {
      let targetStorage: WritableMapStorage;
      try {
        targetStorage = storage ?? window.localStorage;
      } catch {
        publishNotice({
          kind: "error",
          message: "ブラウザへ自動保存できませんでした。",
        });
        return;
      }

      const written = writeStoredMapJson(targetStorage, currentSnapshot);
      if (!written.ok) {
        publishNotice({ kind: "error", message: written.error });
        return;
      }

      lastPersistedSnapshotRef.current = currentSnapshot;
      if (mustSaveCurrentSnapshot) forcedSnapshotRef.current = null;
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    currentSnapshot,
    hydrated,
    initialPersistedSnapshot,
    publishNotice,
    saveRequestRevision,
    storage,
  ]);

  const requestSnapshotSave = useCallback((snapshot: string) => {
    forcedSnapshotRef.current = snapshot;
    setSaveRequestRevision((revision) => revision + 1);
  }, []);

  return { requestSnapshotSave };
}
