import { decodeMapIndex, isValidMapId } from "@/domain/mapLibrary/mapIndex";
import { isRecord } from "@/domain/shared/unknownRecord";

export const BRANCH_MOVE_JOURNAL_KEY = "draw-my-map.branch-move.v1";
export type BranchMoveJournal = {
  version: 1;
  sourceId: string;
  targetId: string;
  sourceBefore: string | null;
  targetBefore: string | null;
  indexBefore: string;
};

export function decodeBranchMoveJournal(raw: string): BranchMoveJournal | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || Object.keys(value).length !== 6 ||
    value.version !== 1 || !isValidMapId(value.sourceId) ||
    !isValidMapId(value.targetId) || value.sourceId === value.targetId ||
    (value.sourceBefore !== null && typeof value.sourceBefore !== "string") ||
    (value.targetBefore !== null && typeof value.targetBefore !== "string") ||
    typeof value.indexBefore !== "string")
    return null;
  const decoded = decodeMapIndex(value.indexBefore);
  // 補正が要るインデックスも原文のまま持つので、戻すときは補正前の文字列に戻る
  if (decoded.kind !== "ok" ||
    decoded.index.currentMapId !== value.sourceId ||
    !decoded.index.maps.some(map => map.id === value.targetId))
    return null;
  return { version: 1, sourceId: value.sourceId, targetId: value.targetId,
    sourceBefore: value.sourceBefore, targetBefore: value.targetBefore, indexBefore: value.indexBefore };
}

export function encodeBranchMoveJournal(journal: BranchMoveJournal): string {
  return JSON.stringify(journal);
}
