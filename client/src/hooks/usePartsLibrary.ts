"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canUseSelectionScope } from "@/domain/exportScope/exportFormatAvailability";
import {
  buildPartFromSubtree,
  createPartId,
  MAX_PART_NAME,
  type Part,
  type PartsStore,
} from "@/domain/parts/partsModel";
import type { MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";
import {
  readParts,
  writeParts,
} from "@/services/persistence/partsStorage";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

export type PartsLibraryFailureReason =
  | "selection"
  | "too-large"
  | "root-missing"
  | "corrupt"
  | "read-error"
  | "quota-exceeded"
  | "write-error"
  | "part-missing"
  | "insert-failed"
  | "empty-name"
  | "name-too-long";

export type PartsLibraryResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: PartsLibraryFailureReason };

export type UsePartsLibraryOptions = {
  storage: MapLibraryStorage;
  nodes: readonly Node[];
  selectionTargetIds: readonly number[];
  insertSubtree: (
    sources: readonly Node[],
    sourceRootId: number,
    targetParentId: number | null,
  ) => number | null;
  publishNotice: (notice: OperationNotice) => void;
  now?: () => string;
};

export type UsePartsLibraryReturn = {
  parts: readonly Part[];
  canRegister: boolean;
  canInsertChild: boolean;
  refresh: () => void;
  registerPartFromSelection: (name: string) => PartsLibraryResult;
  insertPart: (partId: string, mode: "root" | "child") => PartsLibraryResult;
  deletePart: (partId: string) => PartsLibraryResult;
};

const SELECTION_MESSAGE = "部品の対象にするノードを 1 つだけ選んでください。";
const TOO_LARGE_MESSAGE = "部品のノード数が上限を超えているため登録できません。";
const ROOT_MISSING_MESSAGE = "選択したノードが見つからないため登録できません。";
const CORRUPT_MESSAGE = "部品ライブラリが破損しているため操作できません。";
const READ_ERROR_MESSAGE = "部品ライブラリを読み取れませんでした。";
const QUOTA_MESSAGE = "保存容量が足りないため部品を保存できません。";
const WRITE_ERROR_MESSAGE = "部品ライブラリを保存できませんでした。";
const PART_MISSING_MESSAGE = "指定した部品が見つかりません。";
const INSERT_FAILED_MESSAGE = "部品を挿入できませんでした。";
const EMPTY_NAME_MESSAGE = "部品名を入力してください。";
const NAME_TOO_LONG_MESSAGE = `部品名は ${MAX_PART_NAME} 文字以内で入力してください。`;

type LatestStoreRead =
  | { readonly ok: true; readonly store: PartsStore; readonly repaired: boolean }
  | { readonly ok: false; readonly reason: Extract<PartsLibraryFailureReason, "corrupt" | "read-error"> };

function notifyReadFailure(
  publishNotice: (notice: OperationNotice) => void,
  status: "corrupt" | "read-error",
): LatestStoreRead {
  publishNotice({
    kind: "error",
    message: status === "corrupt" ? CORRUPT_MESSAGE : READ_ERROR_MESSAGE,
  });
  return { ok: false, reason: status };
}

function notifyWriteFailure(
  publishNotice: (notice: OperationNotice) => void,
  status: "quota-exceeded" | "write-error",
): PartsLibraryResult {
  publishNotice({
    kind: "error",
    message: status === "quota-exceeded" ? QUOTA_MESSAGE : WRITE_ERROR_MESSAGE,
  });
  return { ok: false, reason: status };
}

function findPartRootId(nodes: readonly Node[]): number | null {
  const roots = nodes.filter((node) => node.parentId === null);
  if (roots.length !== 1) return null;
  return roots[0]!.id;
}

function readLatestStore(
  storage: MapLibraryStorage,
  publishNotice: (notice: OperationNotice) => void,
): LatestStoreRead {
  const read = readParts(storage);
  if (read.status !== "ok") {
    return notifyReadFailure(publishNotice, read.status);
  }
  if (read.repaired) {
    publishNotice({
      kind: "warning",
      message: "破損した部品エントリを除外して読み込みました。",
    });
  }
  return { ok: true, store: read.store, repaired: read.repaired };
}

// 部品ライブラリの登録・挿入・削除。更新は最新読取 → 変更 → 書き戻し（L-001 / L-002）
export function usePartsLibrary(options: UsePartsLibraryOptions): UsePartsLibraryReturn {
  const {
    storage,
    nodes,
    selectionTargetIds,
    insertSubtree,
    publishNotice,
    now = () => new Date().toISOString(),
  } = options;

  const [parts, setParts] = useState<readonly Part[]>([]);

  const canRegister = canUseSelectionScope(selectionTargetIds);
  const canInsertChild = canRegister;

  const refresh = useCallback(() => {
    const latest = readLatestStore(storage, publishNotice);
    if (!latest.ok) {
      setParts([]);
      return;
    }
    setParts(latest.store.parts);
  }, [storage, publishNotice]);

  /* eslint-disable react-hooks/set-state-in-effect -- 同期ストレージ読込は useMapViewBookmarks と同型 */
  useEffect(() => {
    refresh();
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const registerPartFromSelection = useCallback((name: string): PartsLibraryResult => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      publishNotice({ kind: "error", message: EMPTY_NAME_MESSAGE });
      return { ok: false, reason: "empty-name" };
    }
    if (trimmed.length > MAX_PART_NAME) {
      publishNotice({ kind: "error", message: NAME_TOO_LONG_MESSAGE });
      return { ok: false, reason: "name-too-long" };
    }
    if (!canUseSelectionScope(selectionTargetIds)) {
      publishNotice({ kind: "error", message: SELECTION_MESSAGE });
      return { ok: false, reason: "selection" };
    }

    const built = buildPartFromSubtree(
      nodes,
      selectionTargetIds[0]!,
      trimmed,
      createPartId(),
      now(),
    );
    if (!built.ok) {
      publishNotice({
        kind: "error",
        message: built.reason === "too-large" ? TOO_LARGE_MESSAGE : ROOT_MISSING_MESSAGE,
      });
      return { ok: false, reason: built.reason };
    }

    const latest = readLatestStore(storage, publishNotice);
    if (!latest.ok) return latest;

    const nextStore: PartsStore = {
      version: 1,
      parts: [...latest.store.parts, built.part],
    };
    const written = writeParts(storage, nextStore);
    if (written.status !== "ok") {
      return notifyWriteFailure(publishNotice, written.status);
    }
    setParts(nextStore.parts);
    publishNotice({
      kind: "status",
      message: `部品「${trimmed}」を登録しました。`,
    });
    return { ok: true };
  }, [nodes, selectionTargetIds, storage, publishNotice, now]);

  const insertPart = useCallback((
    partId: string,
    mode: "root" | "child",
  ): PartsLibraryResult => {
    if (mode === "child" && !canUseSelectionScope(selectionTargetIds)) {
      publishNotice({ kind: "error", message: SELECTION_MESSAGE });
      return { ok: false, reason: "selection" };
    }

    const latest = readLatestStore(storage, publishNotice);
    if (!latest.ok) return latest;

    const part = latest.store.parts.find((entry) => entry.id === partId);
    if (part === undefined) {
      publishNotice({ kind: "error", message: PART_MISSING_MESSAGE });
      setParts(latest.store.parts);
      return { ok: false, reason: "part-missing" };
    }

    const sourceRootId = findPartRootId(part.nodes);
    if (sourceRootId === null) {
      publishNotice({ kind: "error", message: PART_MISSING_MESSAGE });
      return { ok: false, reason: "part-missing" };
    }

    const targetParentId = mode === "root" ? null : selectionTargetIds[0]!;
    const insertedRootId = insertSubtree(part.nodes, sourceRootId, targetParentId);
    if (insertedRootId === null) {
      publishNotice({ kind: "error", message: INSERT_FAILED_MESSAGE });
      return { ok: false, reason: "insert-failed" };
    }

    setParts(latest.store.parts);
    publishNotice({
      kind: "status",
      message: mode === "root"
        ? `部品「${part.name}」を新しいルートとして挿入しました。`
        : `部品「${part.name}」を選択ノードの子として挿入しました。`,
    });
    return { ok: true };
  }, [selectionTargetIds, storage, publishNotice, insertSubtree]);

  const deletePart = useCallback((partId: string): PartsLibraryResult => {
    const latest = readLatestStore(storage, publishNotice);
    if (!latest.ok) return latest;

    if (!latest.store.parts.some((entry) => entry.id === partId)) {
      setParts(latest.store.parts);
      publishNotice({ kind: "error", message: PART_MISSING_MESSAGE });
      return { ok: false, reason: "part-missing" };
    }

    const nextStore: PartsStore = {
      version: 1,
      parts: latest.store.parts.filter((entry) => entry.id !== partId),
    };
    const written = writeParts(storage, nextStore);
    if (written.status !== "ok") {
      return notifyWriteFailure(publishNotice, written.status);
    }
    setParts(nextStore.parts);
    publishNotice({ kind: "status", message: "部品を削除しました。" });
    return { ok: true };
  }, [storage, publishNotice]);

  return useMemo(
    () => ({
      parts,
      canRegister,
      canInsertChild,
      refresh,
      registerPartFromSelection,
      insertPart,
      deletePart,
    }),
    [
      parts,
      canRegister,
      canInsertChild,
      refresh,
      registerPartFromSelection,
      insertPart,
      deletePart,
    ],
  );
}
