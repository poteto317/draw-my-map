"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { autoSaveFailedNotice } from "@/domain/mapLibrary/mapLibraryMessages";
import type { MapBodyWriteResult, MapFlushResult } from "@/types/mapStorageSession";
import type { OperationNotice } from "@/types/operationNotice";

type UseMapStorageAutoSaveOptions = {
  currentSnapshot: string;
  hydrated: boolean;
  initialPersistedSnapshot: string | null;
  publishNotice: (notice: OperationNotice) => void;
  writeBody: (json: string) => MapBodyWriteResult;
  clearSaveFailureNotice: () => void;
};

type UseMapStorageAutoSaveResult = {
  requestSnapshotSave: (snapshot: string) => void;
  flushPendingSave: () => MapFlushResult;
};

export function useMapStorageAutoSave({
  currentSnapshot,
  hydrated,
  initialPersistedSnapshot,
  publishNotice,
  writeBody,
  clearSaveFailureNotice,
}: UseMapStorageAutoSaveOptions): UseMapStorageAutoSaveResult {
  const [saveRequestRevision, setSaveRequestRevision] = useState(0);
  const baselineInitializedRef = useRef(false);
  const lastPersistedSnapshotRef = useRef<string | null>(null);
  const forcedSnapshotRef = useRef<string | null>(null);
  const pendingTimerRef = useRef<number | null>(null);
  // flush は ref だけを読むので、コミット後の値を layout effect で同期する
  const currentSnapshotRef = useRef(currentSnapshot);
  const writeBodyRef = useRef(writeBody);
  const publishNoticeRef = useRef(publishNotice);
  const clearSaveFailureNoticeRef = useRef(clearSaveFailureNotice);

  useLayoutEffect(() => {
    currentSnapshotRef.current = currentSnapshot;
    writeBodyRef.current = writeBody;
    publishNoticeRef.current = publishNotice;
    clearSaveFailureNoticeRef.current = clearSaveFailureNotice;
    if (hydrated && !baselineInitializedRef.current) {
      baselineInitializedRef.current = true;
      lastPersistedSnapshotRef.current = initialPersistedSnapshot;
    }
  }, [
    clearSaveFailureNotice,
    currentSnapshot,
    hydrated,
    initialPersistedSnapshot,
    publishNotice,
    writeBody,
  ]);

  useEffect(() => {
    if (!hydrated) return;

    const mustSaveCurrentSnapshot = forcedSnapshotRef.current === currentSnapshot;
    if (
      !mustSaveCurrentSnapshot
      && currentSnapshot === lastPersistedSnapshotRef.current
    ) return;

    const timer = window.setTimeout(() => {
      pendingTimerRef.current = null;
      const written = writeBody(currentSnapshot);
      if (written.status === "failed") {
        publishNotice(autoSaveFailedNotice());
        return;
      }
      // 保存先が無効（切り替え後・保護モード）なら通知せず、保存済みとしても扱わない
      if (written.status === "inactive") return;

      lastPersistedSnapshotRef.current = currentSnapshot;
      if (mustSaveCurrentSnapshot) forcedSnapshotRef.current = null;
    }, 300);
    pendingTimerRef.current = timer;

    return () => {
      window.clearTimeout(timer);
      if (pendingTimerRef.current === timer) pendingTimerRef.current = null;
    };
  }, [
    currentSnapshot,
    hydrated,
    initialPersistedSnapshot,
    publishNotice,
    saveRequestRevision,
    writeBody,
  ]);

  const requestSnapshotSave = useCallback((snapshot: string) => {
    forcedSnapshotRef.current = snapshot;
    setSaveRequestRevision((revision) => revision + 1);
  }, []);

  const flushPendingSave = useCallback((): MapFlushResult => {
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

    const written = writeBodyRef.current(snapshot);
    if (written.status === "failed") {
      // 呼び出し元のダイアログ内の通知は閉じると消えるので、未保存であることをエディタの通知にも残す
      publishNoticeRef.current(autoSaveFailedNotice());
      return { status: "failed", error: written.error };
    }
    if (written.status === "inactive") return { status: "unchanged" };

    lastPersistedSnapshotRef.current = snapshot;
    if (mustSaveSnapshot) forcedSnapshotRef.current = null;
    clearSaveFailureNoticeRef.current();
    return { status: "saved" };
  }, []);

  return { requestSnapshotSave, flushPendingSave };
}
