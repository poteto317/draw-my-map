import { decodeMapIndex, encodeMapIndex, findMapEntry, openMapAfterBranchTransfer, type MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import { transferNodeBranch } from "@/domain/nodes/nodeBranchMove";
import { createNodeIdAllocator } from "@/domain/nodes/nodeIdAllocator";
import { createMapDocument, parseMapDocumentJson, serializeMapDocument } from "@/domain/persistence/mapDocumentCodec";
import type { NodeMapState } from "@/types/nodeMapState";
import { writeBranchMove } from "./branchMoveTransaction";
import { MAP_INDEX_STORAGE_KEY, readMapBody, type MapLibraryStorage } from "./mapLibraryStorage";

type StoredIndex = { index: MapIndexV1; raw: string };
export type StoredBranchTransferResult =
  | { ok: true; index: MapIndexV1 }
  | { ok: false; error: string; recoveryRequired: boolean; sourceJson: string | null };

type TransferDocuments =
  | { ok: true; sourceJson: string; targetJson: string | null; source: NodeMapState; target: NodeMapState }
  | { ok: false; sourceJson: string | null };

const TRANSFER_ERROR = "枝を移動できませんでした。移動元と移動先の保存データを確認してやり直してください。";

// 起動は補正を書き戻さないので、補正待ちのインデックスも読む。原文はジャーナルの原本として保つ。
export function readBranchMoveIndex(storage: MapLibraryStorage): StoredIndex | null {
  try {
    const raw = storage.getItem(MAP_INDEX_STORAGE_KEY);
    if (raw === null) return null;
    const decoded = decodeMapIndex(raw);
    return decoded.kind === "ok" ? { index: decoded.index, raw } : null;
  } catch {
    return null;
  }
}

// 未作成の移動先（本体が null）は空マップとして扱う。壊れた本体は空にせず拒否する
function readTransferDocuments(storage: MapLibraryStorage, sourceId: string, targetId: string): TransferDocuments {
  const sourceRaw = readMapBody(storage, sourceId);
  if (!sourceRaw.ok || sourceRaw.value === null) return { ok: false, sourceJson: null };
  const sourceJson = sourceRaw.value;
  const targetRaw = readMapBody(storage, targetId);
  if (!targetRaw.ok) return { ok: false, sourceJson };
  const source = parseMapDocumentJson(sourceJson);
  const target = targetRaw.value === null
    ? { ok: true as const, value: createMapDocument([], "manual") }
    : parseMapDocumentJson(targetRaw.value);
  if (!source.ok || !target.ok) return { ok: false, sourceJson };
  return { ok: true, sourceJson, targetJson: targetRaw.value, source: source.value, target: target.value };
}

export function transferStoredBranch(
  storage: MapLibraryStorage,
  index: MapIndexV1,
  sourceId: string,
  targetId: string,
  rootId: number,
  now: Date,
): StoredBranchTransferResult {
  const failed = (sourceJson: string | null = null): StoredBranchTransferResult => ({
    ok: false, error: TRANSFER_ERROR, recoveryRequired: false, sourceJson,
  });
  const stored = readBranchMoveIndex(storage);
  if (
    stored === null || encodeMapIndex(stored.index) !== encodeMapIndex(index)
    || sourceId === targetId || index.currentMapId !== sourceId
    || findMapEntry(index, sourceId) === null || findMapEntry(index, targetId) === null
    || !Number.isFinite(now.getTime())
  ) return failed();

  const documents = readTransferDocuments(storage, sourceId, targetId);
  if (!documents.ok) return failed(documents.sourceJson);
  const { sourceJson, targetJson } = documents;
  const moved = transferNodeBranch(documents.source, documents.target, rootId, createNodeIdAllocator().nextAvailableIds);
  if (!moved.ok) return failed(sourceJson);

  const next = openMapAfterBranchTransfer(index, sourceId, targetId, now.toISOString());
  const written = writeBranchMove(storage, {
    sourceId, targetId, sourceBefore: sourceJson, targetBefore: targetJson, indexBefore: stored.raw,
    sourceAfter: serializeMapDocument(createMapDocument(moved.source.nodes, moved.source.layoutMode)),
    targetAfter: serializeMapDocument(createMapDocument(moved.target.nodes, moved.target.layoutMode)),
    indexAfter: encodeMapIndex(next),
  });
  return written.ok
    ? { ok: true, index: next }
    : { ...written, sourceJson };
}
