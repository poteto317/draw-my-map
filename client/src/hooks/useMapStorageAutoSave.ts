"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { autoSaveFailedNotice } from "@/domain/mapLibrary/mapLibraryMessages";
import type { ConflictState } from "@/domain/mapLibrary/mapConflict";
import { deriveMapSaveStatus, type MapRestoreOrigin, type MapSaveStatus } from "@/domain/persistence/mapSaveStatus";
import type { MapBodyWriteResult, MapFlushResult } from "@/types/mapStorageSession";
import type { OperationNotice } from "@/types/operationNotice";

type UseMapStorageAutoSaveOptions = {
  currentSnapshot: string;
  hydrated: boolean;
  initialPersistedSnapshot: string | null;
  restoreOrigin: MapRestoreOrigin | null;
  storageMode: "persistent" | "protected";
  publishNotice: (notice: OperationNotice) => void;
  writeBody: (json: string) => MapBodyWriteResult;
  clearSaveFailureNotice: () => void;
  conflictState?: ConflictState;
  onWriteConflict?: () => void;
  onSaveSuccess?: (snapshot: string) => void;
};

type UseMapStorageAutoSaveResult = {
  requestSnapshotSave: (snapshot: string) => void;
  flushPendingSave: () => MapFlushResult;
  saveStatus: MapSaveStatus;
  hasSavedBodyThisMount: () => boolean;
  hasPendingEdits: boolean;
  rebaseConfirmedSnapshot: (snapshotJson: string) => void;
};

export function useMapStorageAutoSave({
  currentSnapshot,
  hydrated,
  initialPersistedSnapshot,
  restoreOrigin,
  storageMode,
  publishNotice,
  writeBody,
  clearSaveFailureNotice,
  conflictState,
  onWriteConflict,
  onSaveSuccess,
}: UseMapStorageAutoSaveOptions): UseMapStorageAutoSaveResult {
  const [saveRequestRevision, setSaveRequestRevision] = useState(0);
  const [statusEvidence, setStatusEvidence] = useState<{
    confirmedSnapshot: string | null;
    forcedSnapshot: string | null;
    hasSaveFailure: boolean;
  }>({ confirmedSnapshot: null, forcedSnapshot: null, hasSaveFailure: false });
  const [previousSnapshot, setPreviousSnapshot] = useState(currentSnapshot);
  const baselineInitializedRef = useRef(false);
  const lastPersistedSnapshotRef = useRef<string | null>(null);
  const confirmedSnapshotRef = useRef<string | null>(null);
  const hasSaveFailureRef = useRef(false);
  const hasSavedBodyThisMountRef = useRef(false);
  const forcedSnapshotRef = useRef<string | null>(null);
  const forceGenerationRef = useRef(0);
  const pendingTimerRef = useRef<number | null>(null);
  // flush は ref だけを読むので、コミット後の値を layout effect で同期する
  const currentSnapshotRef = useRef(currentSnapshot);
  const writeBodyRef = useRef(writeBody);
  const publishNoticeRef = useRef(publishNotice);
  const clearSaveFailureNoticeRef = useRef(clearSaveFailureNotice);
  const conflictStateRef = useRef(conflictState);
  const onWriteConflictRef = useRef(onWriteConflict);
  const onSaveSuccessRef = useRef(onSaveSuccess);
  const handleWriteResultRef = useRef<(snapshot: string, written: MapBodyWriteResult, forceGeneration: number) => MapFlushResult>(() => ({ status: "unchanged" }));

  const confirmedSnapshot = statusEvidence.confirmedSnapshot
    ?? (restoreOrigin === "restored" ? initialPersistedSnapshot : null);

  const hasPendingEdits =
    confirmedSnapshot !== null
      ? currentSnapshot !== confirmedSnapshot
      : currentSnapshot !== initialPersistedSnapshot;

  if (previousSnapshot !== currentSnapshot) {
    setPreviousSnapshot(currentSnapshot);
    if ((statusEvidence.hasSaveFailure || statusEvidence.forcedSnapshot !== null)
      && statusEvidence.forcedSnapshot !== currentSnapshot
      && confirmedSnapshot !== null
      && currentSnapshot === confirmedSnapshot) {
      setStatusEvidence((previous) => ({ ...previous, forcedSnapshot: null, hasSaveFailure: false }));
    }
  }
  const saveStatus = deriveMapSaveStatus({
    hydrated,
    restoreOrigin,
    currentSnapshot,
    initialPersistedSnapshot,
    confirmedSnapshot,
    forcedSnapshot: statusEvidence.forcedSnapshot,
    hasSaveFailure: statusEvidence.hasSaveFailure,
    storageMode,
    conflictState,
  });

  useLayoutEffect(() => {
    currentSnapshotRef.current = currentSnapshot;
    writeBodyRef.current = writeBody;
    publishNoticeRef.current = publishNotice;
    clearSaveFailureNoticeRef.current = clearSaveFailureNotice;
    conflictStateRef.current = conflictState;
    onWriteConflictRef.current = onWriteConflict;
    onSaveSuccessRef.current = onSaveSuccess;
    handleWriteResultRef.current = (snapshot, written, forceGeneration) => {
      if (written.status === "conflict") {
        onWriteConflictRef.current?.();
        if (pendingTimerRef.current !== null) {
          window.clearTimeout(pendingTimerRef.current);
          pendingTimerRef.current = null;
        }
        return { status: "conflict" };
      }
      if (written.status === "failed") {
        hasSaveFailureRef.current = true;
        publishNoticeRef.current(autoSaveFailedNotice());
        setStatusEvidence((previous) => ({ ...previous, hasSaveFailure: true }));
        return { status: "failed", error: written.error };
      }
      if (written.status === "inactive") return { status: "unchanged" };

      lastPersistedSnapshotRef.current = snapshot;
      hasSavedBodyThisMountRef.current = true;
      confirmedSnapshotRef.current = snapshot;
      // 成功した書込より後の明示要求だけを残す。古い要求は新しい編集の保存で置換される。
      if (forceGenerationRef.current === forceGeneration) forcedSnapshotRef.current = null;
      hasSaveFailureRef.current = false;
      clearSaveFailureNoticeRef.current();
      setStatusEvidence({ confirmedSnapshot: snapshot, forcedSnapshot: forcedSnapshotRef.current, hasSaveFailure: false });
      onSaveSuccessRef.current?.(snapshot);
      return { status: "saved" };
    };
    if (hydrated && !baselineInitializedRef.current) {
      baselineInitializedRef.current = true;
      lastPersistedSnapshotRef.current = initialPersistedSnapshot;
      if (restoreOrigin === "restored") confirmedSnapshotRef.current = initialPersistedSnapshot;
    }
    if (confirmedSnapshotRef.current !== null
      && currentSnapshot === confirmedSnapshotRef.current
      && forcedSnapshotRef.current !== currentSnapshot) {
      // 内容変更で確認済み基準へ戻った場合、別snapshotを対象にした古い要求は失効する。
      forcedSnapshotRef.current = null;
      if (hasSaveFailureRef.current) {
        hasSaveFailureRef.current = false;
        clearSaveFailureNoticeRef.current();
      }
    }
  }, [
    clearSaveFailureNotice,
    conflictState,
    currentSnapshot,
    hydrated,
    initialPersistedSnapshot,
    onWriteConflict,
    onSaveSuccess,
    publishNotice,
    restoreOrigin,
    writeBody,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    if (conflictState && conflictState !== "none") {
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      return;
    }

    const mustSaveCurrentSnapshot = forcedSnapshotRef.current === currentSnapshot;
    if (
      !mustSaveCurrentSnapshot
      && currentSnapshot === lastPersistedSnapshotRef.current
    ) return;

    const timer = window.setTimeout(() => {
      pendingTimerRef.current = null;
      if (conflictStateRef.current && conflictStateRef.current !== "none") {
        return;
      }
      const forceGeneration = forceGenerationRef.current;
      const written = writeBody(currentSnapshot);
      handleWriteResultRef.current(currentSnapshot, written, forceGeneration);
    }, 300);
    pendingTimerRef.current = timer;

    return () => {
      window.clearTimeout(timer);
      if (pendingTimerRef.current === timer) pendingTimerRef.current = null;
    };
  }, [
    conflictState,
    currentSnapshot,
    hydrated,
    initialPersistedSnapshot,
    saveRequestRevision,
    writeBody,
  ]);

  const requestSnapshotSave = useCallback((snapshot: string) => {
    forceGenerationRef.current += 1;
    forcedSnapshotRef.current = snapshot;
    setStatusEvidence((previous) => ({ ...previous, forcedSnapshot: snapshot }));
    setSaveRequestRevision((revision) => revision + 1);
  }, []);

  const flushPendingSave = useCallback((): MapFlushResult => {
    if (conflictStateRef.current === "conflict" || conflictStateRef.current === "externallyDeleted") {
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      return { status: "conflict" };
    }
    if (conflictStateRef.current === "externalUpdate") {
      if (pendingTimerRef.current !== null) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      return { status: "unchanged" };
    }

    // 復元前は保存の基準が無いので、空のマップで本体を上書きしない
    if (!baselineInitializedRef.current) return { status: "unchanged" };

    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }

    const snapshot = currentSnapshotRef.current;
    const mustSaveSnapshot = forcedSnapshotRef.current === snapshot;
    if (!mustSaveSnapshot && snapshot === lastPersistedSnapshotRef.current) {
      return { status: "unchanged" };
    }

    const forceGeneration = forceGenerationRef.current;
    const written = writeBodyRef.current(snapshot);
    return handleWriteResultRef.current(snapshot, written, forceGeneration);
  }, []);

  const hasSavedBodyThisMount = useCallback(() => hasSavedBodyThisMountRef.current, []);

  const rebaseConfirmedSnapshot = useCallback((snapshotJson: string) => {
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    baselineInitializedRef.current = true;
    lastPersistedSnapshotRef.current = snapshotJson;
    confirmedSnapshotRef.current = snapshotJson;
    setStatusEvidence((previous) => ({
      ...previous,
      confirmedSnapshot: snapshotJson,
      forcedSnapshot: null,
      hasSaveFailure: false,
    }));
    onSaveSuccessRef.current?.(snapshotJson);
  }, []);

  return {
    requestSnapshotSave,
    flushPendingSave,
    saveStatus,
    hasSavedBodyThisMount,
    hasPendingEdits,
    rebaseConfirmedSnapshot,
  };
}
