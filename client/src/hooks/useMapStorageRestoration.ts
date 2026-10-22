"use client";

import { useEffect, useRef, useState } from "react";
import {
  parseMapDocumentJsonWithVersion,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import type { MapDocumentResult } from "@/types/mapDocument";
import type { NodeMapState } from "@/types/nodeMapState";
import type { OperationNotice } from "@/types/operationNotice";

type UseMapStorageRestorationOptions = {
  currentSnapshot: string;
  replaceMap: (state: NodeMapState) => void;
  publishNotice: (notice: OperationNotice) => void;
  readBody: () => MapDocumentResult<string | null>;
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
  readBody,
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

    const stored = readBody();
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

    const parsed = parseMapDocumentJsonWithVersion(stored.value);
    if (!parsed.ok) {
      publishNotice({ kind: "warning", message: RESTORE_WARNING });
      setRestoration({
        hydrated: true,
        initialPersistedSnapshot: currentSnapshot,
      });
      return;
    }

    const { document, sourceVersion } = parsed.value;
    replaceMap({
      layoutMode: document.layoutMode,
      nodes: document.nodes,
    });
    setRestoration({
      hydrated: true,
      initialPersistedSnapshot: sourceVersion === 1
        ? stored.value
        : serializeMapDocument(document),
    });
  }, [currentSnapshot, publishNotice, readBody, replaceMap]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return restoration;
}
