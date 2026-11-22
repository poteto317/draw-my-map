"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canUseSelectionScope } from "@/domain/exportScope/exportFormatAvailability";
import {
  MAX_PINS_PER_MAP,
  pruneAbsentNodePins,
  type NodePin,
} from "@/domain/pins/pinsModel";
import type { MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";
import {
  readPins,
  writePins,
} from "@/services/persistence/nodePinsStorage";
import type { NodeSearchNavigationResult } from "@/hooks/useNodeSearchNavigation";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

export type NodePinsFailureReason =
  | "selection"
  | "already-pinned"
  | "too-many"
  | "missing-node"
  | "pin-missing"
  | "corrupt"
  | "read-error"
  | "quota-exceeded"
  | "write-error"
  | "jump-failed";

export type NodePinsResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: NodePinsFailureReason };

export type UseNodePinsOptions = {
  storage: MapLibraryStorage;
  mapId: string;
  nodes: readonly Node[];
  selectionTargetIds: readonly number[];
  publishNotice: (notice: OperationNotice) => void;
  navigateToNode: (nodeId: number) => NodeSearchNavigationResult;
  now?: () => string;
};

export type UseNodePinsReturn = {
  pins: readonly NodePin[];
  pinnedNodeIds: ReadonlySet<number>;
  canRegister: boolean;
  registerPin: () => NodePinsResult;
  deletePin: (nodeId: number) => NodePinsResult;
  jumpToPin: (nodeId: number) => NodePinsResult;
};

const SELECTION_MESSAGE = "ピンするノードを 1 つだけ選んでください。";
const ALREADY_PINNED_MESSAGE = "選択中のノードはすでにピン済みです。";
const TOO_MANY_MESSAGE = `ピンはマップあたり最大 ${MAX_PINS_PER_MAP} 件まで登録できます。`;
const MISSING_NODE_MESSAGE = "ピン先のノードが見つかりません。";
const PIN_MISSING_MESSAGE = "指定したピンが見つかりません。";
const CORRUPT_MESSAGE = "ノードピンのデータが破損しているため操作できません。";
const READ_ERROR_MESSAGE = "ノードピンを読み取れませんでした。";
const QUOTA_MESSAGE = "保存容量が足りないためピンを保存できません。";
const WRITE_ERROR_MESSAGE = "ノードピンを保存できませんでした。";
const REPAIRED_MESSAGE = "存在しないノードのピンを取り除きました。";

type LatestPinsRead =
  | { readonly ok: true; readonly pins: NodePin[]; readonly repaired: boolean }
  | { readonly ok: false; readonly reason: Extract<NodePinsFailureReason, "corrupt" | "read-error"> };

function notifyReadFailure(
  publishNotice: (notice: OperationNotice) => void,
  status: "corrupt" | "read-error",
): LatestPinsRead {
  publishNotice({
    kind: "error",
    message: status === "corrupt" ? CORRUPT_MESSAGE : READ_ERROR_MESSAGE,
  });
  return { ok: false, reason: status };
}

function notifyWriteFailure(
  publishNotice: (notice: OperationNotice) => void,
  status: "quota-exceeded" | "write-error",
): NodePinsResult {
  publishNotice({
    kind: "error",
    message: status === "quota-exceeded" ? QUOTA_MESSAGE : WRITE_ERROR_MESSAGE,
  });
  return { ok: false, reason: status };
}

function readLatestPins(
  storage: MapLibraryStorage,
  mapId: string,
  publishNotice: (notice: OperationNotice) => void,
): LatestPinsRead {
  const read = readPins(storage, mapId);
  if (read.status !== "ok") {
    return notifyReadFailure(publishNotice, read.status);
  }
  return { ok: true, pins: read.pins, repaired: read.repaired };
}

function existingNodeIdSet(nodes: readonly Node[]): ReadonlySet<number> {
  return new Set(nodes.map((node) => node.id));
}

// マップ単位のノードピン。更新は最新読取 → 変更 → 書き戻し（L-001 / L-002 / L-921）
export function useNodePins(options: UseNodePinsOptions): UseNodePinsReturn {
  const {
    storage,
    mapId,
    nodes,
    selectionTargetIds,
    publishNotice,
    navigateToNode,
    now = () => new Date().toISOString(),
  } = options;

  const [pins, setPins] = useState<readonly NodePin[]>([]);
  const canRegister = canUseSelectionScope(selectionTargetIds);

  const syncPins = useCallback((options?: {
    announceRepair?: boolean;
  }): LatestPinsRead => {
    const latest = readLatestPins(storage, mapId, publishNotice);
    if (!latest.ok) {
      setPins([]);
      return latest;
    }

    const pruned = pruneAbsentNodePins(latest.pins, existingNodeIdSet(nodes));
    const repaired = latest.repaired || pruned.repaired;

    if (repaired) {
      const written = writePins(storage, mapId, pruned.pins);
      if (written.status !== "ok") {
        notifyWriteFailure(publishNotice, written.status);
        setPins(pruned.pins);
        return { ok: true, pins: pruned.pins, repaired };
      }
      if (options?.announceRepair !== false) {
        publishNotice({ kind: "warning", message: REPAIRED_MESSAGE });
      }
    }

    setPins(pruned.pins);
    return { ok: true, pins: pruned.pins, repaired };
  }, [storage, mapId, nodes, publishNotice]);

  /* eslint-disable react-hooks/set-state-in-effect -- 同期ストレージ読込・不在 ID 掃除は usePartsLibrary と同型 */
  useEffect(() => {
    syncPins();
  }, [syncPins]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const registerPin = useCallback((): NodePinsResult => {
    if (!canUseSelectionScope(selectionTargetIds)) {
      publishNotice({ kind: "error", message: SELECTION_MESSAGE });
      return { ok: false, reason: "selection" };
    }

    const nodeId = selectionTargetIds[0]!;
    if (!nodes.some((node) => node.id === nodeId)) {
      publishNotice({ kind: "error", message: MISSING_NODE_MESSAGE });
      return { ok: false, reason: "missing-node" };
    }

    const latest = readLatestPins(storage, mapId, publishNotice);
    if (!latest.ok) return latest;

    const pruned = pruneAbsentNodePins(latest.pins, existingNodeIdSet(nodes));
    if (pruned.pins.some((pin) => pin.nodeId === nodeId)) {
      setPins(pruned.pins);
      publishNotice({ kind: "error", message: ALREADY_PINNED_MESSAGE });
      return { ok: false, reason: "already-pinned" };
    }
    if (pruned.pins.length >= MAX_PINS_PER_MAP) {
      setPins(pruned.pins);
      publishNotice({ kind: "error", message: TOO_MANY_MESSAGE });
      return { ok: false, reason: "too-many" };
    }

    const nextPins: NodePin[] = [
      ...pruned.pins,
      { nodeId, createdAt: now() },
    ];
    const written = writePins(storage, mapId, nextPins);
    if (written.status !== "ok") {
      return notifyWriteFailure(publishNotice, written.status);
    }
    setPins(nextPins);
    publishNotice({ kind: "status", message: "ノードをピンしました。" });
    return { ok: true };
  }, [selectionTargetIds, nodes, storage, mapId, publishNotice, now]);

  const deletePin = useCallback((nodeId: number): NodePinsResult => {
    const latest = readLatestPins(storage, mapId, publishNotice);
    if (!latest.ok) return latest;

    const pruned = pruneAbsentNodePins(latest.pins, existingNodeIdSet(nodes));
    if (!pruned.pins.some((pin) => pin.nodeId === nodeId)) {
      setPins(pruned.pins);
      publishNotice({ kind: "error", message: PIN_MISSING_MESSAGE });
      return { ok: false, reason: "pin-missing" };
    }

    const nextPins = pruned.pins.filter((pin) => pin.nodeId !== nodeId);
    const written = writePins(storage, mapId, nextPins);
    if (written.status !== "ok") {
      return notifyWriteFailure(publishNotice, written.status);
    }
    setPins(nextPins);
    publishNotice({ kind: "status", message: "ピンを削除しました。" });
    return { ok: true };
  }, [storage, mapId, nodes, publishNotice]);

  const jumpToPin = useCallback((nodeId: number): NodePinsResult => {
    const latest = readLatestPins(storage, mapId, publishNotice);
    if (!latest.ok) return latest;

    const pruned = pruneAbsentNodePins(latest.pins, existingNodeIdSet(nodes));
    if (pruned.repaired) {
      const written = writePins(storage, mapId, pruned.pins);
      if (written.status === "ok") {
        setPins(pruned.pins);
        publishNotice({ kind: "warning", message: REPAIRED_MESSAGE });
      } else {
        setPins(pruned.pins);
      }
    } else {
      setPins(pruned.pins);
    }

    if (!pruned.pins.some((pin) => pin.nodeId === nodeId)) {
      publishNotice({ kind: "error", message: PIN_MISSING_MESSAGE });
      return { ok: false, reason: "pin-missing" };
    }
    if (!nodes.some((node) => node.id === nodeId)) {
      publishNotice({ kind: "error", message: MISSING_NODE_MESSAGE });
      return { ok: false, reason: "missing-node" };
    }

    const navigation = navigateToNode(nodeId);
    // navigateToNode 側が missing 時の notice / 非フォーカスを担う（L-001）
    if (navigation === "missing") {
      return { ok: false, reason: "jump-failed" };
    }
    return { ok: true };
  }, [storage, mapId, nodes, publishNotice, navigateToNode]);

  const pinnedNodeIds = useMemo(
    () => new Set(pins.map((pin) => pin.nodeId)),
    [pins],
  );

  return useMemo(
    () => ({
      pins,
      pinnedNodeIds,
      canRegister,
      registerPin,
      deletePin,
      jumpToPin,
    }),
    [pins, pinnedNodeIds, canRegister, registerPin, deletePin, jumpToPin],
  );
}
