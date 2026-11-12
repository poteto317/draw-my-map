import { useCallback, useState } from "react";
import {
  createConflictCopyName,
  type ConflictState,
} from "@/domain/mapLibrary/mapConflict";
import { conflictReloadSuccessNotice } from "@/domain/mapLibrary/mapConflictMessages";
import {
  createMapDocument,
  parseMapDocumentJson,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";
import { useStorageConflictMonitor } from "@/hooks/useStorageConflictMonitor";
import type { MapDocumentV3 } from "@/types/mapDocument";
import type { MapStorageSession } from "@/types/mapStorageSession";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { OperationNotice } from "@/types/operationNotice";

export type LayoutMode = NodeLayoutMode;

export interface UseMapConflictControllerOptions {
  storageSession: MapStorageSession;
  nodes: readonly Node[];
  layoutMode: LayoutMode;
  mapName: string;
  getHasPendingEdits: () => boolean;
  replaceMapAndReset: (document: MapDocumentV3) => void;
  onSaveCurrentAsNewMap?: (name: string, snapshotJson: string) => MapLibraryOperationResult;
  rebaseSnapshot?: (snapshotJson: string) => void;
}

export interface UseMapConflictControllerResult {
  conflictState: ConflictState;
  isConfirmOpen: boolean;
  conflictActionNotice: OperationNotice | null;
  handleSaveAsCopy: () => void;
  handleReloadExternal: () => void;
  handleConfirmReload: () => void;
  handleCancelConfirm: () => void;
  onWriteConflict: () => void;
}

export function useMapConflictController({
  storageSession,
  nodes,
  layoutMode,
  mapName,
  getHasPendingEdits,
  replaceMapAndReset,
  onSaveCurrentAsNewMap,
  rebaseSnapshot,
}: UseMapConflictControllerOptions): UseMapConflictControllerResult {
  const [conflictState, setConflictState] = useState<ConflictState>("none");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [conflictActionNotice, setConflictActionNotice] = useState<OperationNotice | null>(null);

  useStorageConflictMonitor({
    mapId: storageSession.mapId,
    sessionNumber: storageSession.sessionNumber,
    getHasPendingEdits,
    storage: storageSession.storage,
    onExternalChange: (kind) => {
      setConflictState(kind);
    },
  });

  // 外部更新案内中に自タブで編集が発生した場合は即座に競合状態として扱う（純粋派生計算）
  const effectiveConflictState: ConflictState =
    conflictState === "externalUpdate" && getHasPendingEdits()
      ? "conflict"
      : conflictState;

  const handleConfirmReload = useCallback(() => {
    const read = storageSession.readBody();
    if (!read.ok) {
      setIsConfirmOpen(false);
      setConflictActionNotice({ kind: "error", message: read.error });
      return;
    }
    if (read.value === null) {
      setIsConfirmOpen(false);
      setConflictState("externallyDeleted");
      return;
    }
    const parsed = parseMapDocumentJson(read.value);
    if (!parsed.ok) {
      setIsConfirmOpen(false);
      setConflictActionNotice({ kind: "error", message: parsed.error });
      return;
    }
    rebaseSnapshot?.(read.value);
    replaceMapAndReset(parsed.value);
    setConflictState("none");
    setIsConfirmOpen(false);
    setConflictActionNotice(conflictReloadSuccessNotice());
  }, [storageSession, replaceMapAndReset, rebaseSnapshot]);

  const handleReloadExternal = useCallback(() => {
    if (getHasPendingEdits() || effectiveConflictState === "conflict") {
      setIsConfirmOpen(true);
    } else {
      handleConfirmReload();
    }
  }, [getHasPendingEdits, effectiveConflictState, handleConfirmReload]);

  const handleSaveAsCopy = useCallback(() => {
    if (!onSaveCurrentAsNewMap) return;
    const copyName = createConflictCopyName(mapName);
    const currentSnapshotJson = serializeMapDocument(createMapDocument(nodes, layoutMode));
    const result = onSaveCurrentAsNewMap(copyName, currentSnapshotJson);
    if (result.ok) {
      setConflictState("none");
    } else {
      setConflictActionNotice(result.notice);
    }
  }, [mapName, nodes, layoutMode, onSaveCurrentAsNewMap]);

  const handleCancelConfirm = useCallback(() => {
    setIsConfirmOpen(false);
  }, []);

  const onWriteConflict = useCallback(() => {
    setConflictState("conflict");
  }, []);

  return {
    conflictState: effectiveConflictState,
    isConfirmOpen,
    conflictActionNotice,
    handleSaveAsCopy,
    handleReloadExternal,
    handleConfirmReload,
    handleCancelConfirm,
    onWriteConflict,
  };
}
