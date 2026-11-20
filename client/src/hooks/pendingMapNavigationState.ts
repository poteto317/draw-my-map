import type { MapLibraryView } from "@/hooks/mapLibraryState";
import type { PendingMapNodeNavigation } from "@/types/pendingMapNavigation";

// 別マップ切替後のノードジャンプ要求（保留ナビゲーション）の有効性の判定。React に依存しない

// シェル側の判定。マップ切替・削除・保護モード移行などで、要求を出したときの
// マップ・セッションと一致しなくなった要求は破棄する（L-037）
export function isPendingNavigationStale(
  pending: PendingMapNodeNavigation | null,
  view: MapLibraryView,
): boolean {
  return (
    pending !== null
    && (
      view.status !== "ready"
      || view.storageMode !== "persistent"
      || view.currentMap.id !== pending.mapId
      || view.storageSession.sessionNumber !== pending.sessionNumber
    )
  );
}

type PendingNavigationEditor = {
  mapId: string;
  sessionNumber: number;
  hydrated: boolean;
};

// 編集画面側の判定。対象マップ・セッションが一致し、保存済みの内容の復元が済んだときだけ消費する（L-037）
export function isPendingNavigationReadyToConsume(
  pending: PendingMapNodeNavigation | null,
  editor: PendingNavigationEditor,
): pending is PendingMapNodeNavigation {
  return (
    pending !== null
    && pending.mapId === editor.mapId
    && pending.sessionNumber === editor.sessionNumber
    && editor.hydrated
  );
}
