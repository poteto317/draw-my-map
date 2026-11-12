import { MAX_MAP_NAME_LENGTH } from "@/domain/mapLibrary/mapName";
import type { MapDocumentV3 } from "@/types/mapDocument";
import type { Node } from "@/types/node";

export type ConflictState =
  | "none"
  | "conflict"
  | "externalUpdate"
  | "externallyDeleted";

export interface ClassifyStorageChangeParams {
  isCurrentMapBodyKey: boolean;
  isMapIndexKey: boolean;
  newValue: string | null;
  hasPendingEdits: boolean;
  isCurrentMapInIndex: boolean;
}

/**
 * storage イベントから現在のマップに対する競合・更新・削除状態を判定する。
 */
export function classifyStorageChange(
  params: ClassifyStorageChangeParams,
): ConflictState {
  const {
    isCurrentMapBodyKey,
    isMapIndexKey,
    newValue,
    hasPendingEdits,
    isCurrentMapInIndex,
  } = params;

  // 現在のマップ本体キーに対する変更
  if (isCurrentMapBodyKey) {
    if (newValue === null) {
      return "externallyDeleted";
    }
    return hasPendingEdits ? "conflict" : "externalUpdate";
  }

  // マップ一覧キーに対する変更（一覧から現在マップが消えたか）
  if (isMapIndexKey && !isCurrentMapInIndex) {
    return "externallyDeleted";
  }

  return "none";
}

function areNodesEqual(a: Node, b: Node): boolean {
  return (
    a.id === b.id &&
    a.parentId === b.parentId &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.label === b.label &&
    a.importance === b.importance &&
    (a.illustration ?? "") === (b.illustration ?? "")
  );
}

/**
 * 2つの MapDocumentV3 の内容が同一であるかを正規化比較する（知見 L-530）。
 * ノードの順序に依存せず、各ノードのデータフィールドが一致するかを判定する。
 */
export function isDocumentContentEqual(
  docA: MapDocumentV3,
  docB: MapDocumentV3,
): boolean {
  if (docA.version !== docB.version || docA.layoutMode !== docB.layoutMode) {
    return false;
  }

  if (docA.nodes.length !== docB.nodes.length) {
    return false;
  }

  const sortedA = [...docA.nodes].sort((a, b) => a.id - b.id);
  const sortedB = [...docB.nodes].sort((a, b) => a.id - b.id);

  for (let i = 0; i < sortedA.length; i += 1) {
    if (!areNodesEqual(sortedA[i], sortedB[i])) {
      return false;
    }
  }

  return true;
}

const CONFLICT_SUFFIX = "（退避）";

/**
 * 退避用のマップ名を生成する。
 * 末尾に「（退避）」を付与し、合計50コードポイントを超えないように切り詰める。
 */
export function createConflictCopyName(baseName: string): string {
  const suffixCodePoints = Array.from(CONFLICT_SUFFIX);
  const maxBaseLength = MAX_MAP_NAME_LENGTH - suffixCodePoints.length;
  const baseCodePoints = Array.from(baseName);
  const truncatedBase = baseCodePoints.slice(0, maxBaseLength).join("");
  return `${truncatedBase}${CONFLICT_SUFFIX}`;
}
