import type { MapCanvasSelection } from "@/types/mapCanvasSelection";

/** 設計 §10: 関連線／グループ選択中はノード対象操作を無効にする */
export function isNodeTargetOperationBlocked(
  selection: MapCanvasSelection | null | undefined,
): boolean {
  if (selection === null || selection === undefined) return false;
  return selection.type === "relation" || selection.type === "group";
}

export function selectedRelationId(
  selection: MapCanvasSelection | null | undefined,
): number | null {
  if (selection === null || selection === undefined) return null;
  return selection.type === "relation" ? selection.id : null;
}

export function selectedGroupId(
  selection: MapCanvasSelection | null | undefined,
): number | null {
  if (selection === null || selection === undefined) return null;
  return selection.type === "group" ? selection.id : null;
}

export function nodesSelection(ids: readonly number[]): MapCanvasSelection {
  return { type: "nodes", ids };
}

export function relationSelection(id: number): MapCanvasSelection {
  return { type: "relation", id };
}

export function groupSelection(id: number): MapCanvasSelection {
  return { type: "group", id };
}
