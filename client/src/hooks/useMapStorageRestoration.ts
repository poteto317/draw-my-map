"use client";

import { useEffect, useRef, useState } from "react";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentCodec";
import { readStoredMapJson } from "@/services/persistence/mapStorage";
import type { NodeMapState } from "@/types/nodeMapState";
import type { OperationNotice } from "@/types/operationNotice";

type ReadableMapStorage = Pick<Storage, "getItem">;

type UseMapStorageRestorationOptions = {
  currentSnapshot: string;
  replaceMap: (state: NodeMapState) => void;
  publishNotice: (notice: OperationNotice) => void;
  storage?: ReadableMapStorage;
};

type MapStorageRestoration = {
  hydrated: boolean;
  initialPersistedSnapshot: string | null;
};

const RESTORE_WARNING = "保存データを復元できませんでした。空のマップで開始します。";

export function useMapStorageRestoration({
  currentSnapshot,
  replaceMap,
  publishNotice,
  storage,
}: UseMapStorageRestorationOptions): MapStorageRestoration {
  const [restoration, setRestoration] = useState<MapStorageRestoration>({
    hydrated: false,
    initialPersistedSnapshot: null,
  });
  const restoredRef = useRef(false);

  // Mount-time restoration intentionally synchronizes React state with the
  // browser's persisted map before auto-save is enabled.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    let targetStorage: ReadableMapStorage;
    try {
      targetStorage = storage ?? window.localStorage;
    } catch {
      publishNotice({ kind: "warning", message: RESTORE_WARNING });
      setRestoration({
        hydrated: true,
        initialPersistedSnapshot: currentSnapshot,
      });
      return;
    }

    const stored = readStoredMapJson(targetStorage);
    if (!stored.ok || stored.value === null) {
      if (!stored.ok) {
        publishNotice({ kind: "warning", message: RESTORE_WARNING });
      }
      setRestoration({
        hydrated: true,
        initialPersistedSnapshot: currentSnapshot,
      });
      return;
    }

    const parsed = parseMapDocumentJson(stored.value);
    if (!parsed.ok) {
      publishNotice({ kind: "warning", message: RESTORE_WARNING });
      setRestoration({
        hydrated: true,
        initialPersistedSnapshot: currentSnapshot,
      });
      return;
    }

    replaceMap({
      layoutMode: parsed.value.layoutMode,
      nodes: parsed.value.nodes,
    });
    setRestoration({
      hydrated: true,
      initialPersistedSnapshot: stored.value,
    });
  }, [currentSnapshot, publishNotice, replaceMap, storage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return restoration;
}
