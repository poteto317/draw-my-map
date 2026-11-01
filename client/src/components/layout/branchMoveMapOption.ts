import { formatMapUpdatedAt } from "@/domain/mapLibrary/mapTimestamp";
import type { BranchMoveMapTarget } from "@/hooks/branchMoveDialogState";

// マップ名の重複は禁止されていないので、現在のマップの印と同名の更新日時で移動先を見分けられるようにする
export function formatBranchMoveMapOption(
  map: BranchMoveMapTarget,
  maps: readonly BranchMoveMapTarget[],
  currentMapId: string,
): string {
  const notes = [
    map.id === currentMapId ? "現在のマップ" : null,
    maps.some((other) => other.id !== map.id && other.name === map.name)
      ? formatMapUpdatedAt(map.updatedAt)
      : null,
  ].filter((note): note is string => note !== null);
  return notes.length === 0 ? map.name : `${map.name}（${notes.join("・")}）`;
}
