import { useCallback, useRef, useState } from "react";
import {
  areMapStatesEqual,
  beginMapHistoryGroup,
  canRedoMapHistory,
  canUndoMapHistory,
  commitMapHistory,
  createMapHistory,
  finishMapHistoryGroup,
  previewMapHistory,
  redoMapHistory,
  undoMapHistory,
  type MapHistoryGroupLease,
  type MapHistoryState,
} from "@/domain/history/mapHistory";
import type { NodeMapState } from "@/types/nodeMapState";

export function useMapHistory(initial: NodeMapState) {
  const [history, setHistory] = useState(() => createMapHistory(initial));
  // イベント内の連続操作でも最新を参照できるよう、refを正としてstateへ同じ結果を渡す
  const historyRef = useRef(history);
  // 現在有効なグループのトークン。グループの有無の正は history.groupStart で、
  // groupStart が閉じたら apply が失効させる（ここ以外でnullにしない）
  const activeTokenRef = useRef<number | null>(null);
  const nextTokenRef = useRef(0);

  const apply = useCallback((next: MapHistoryState) => {
    historyRef.current = next;
    if (next.groupStart === null) activeTokenRef.current = null;
    setHistory(next);
  }, []);

  const transition = useCallback(
    (step: (current: MapHistoryState) => MapHistoryState): boolean => {
      const before = historyRef.current;
      const after = step(before);
      if (after !== before) apply(after);
      return !areMapStatesEqual(before.present, after.present);
    },
    [apply],
  );

  const getPresent = useCallback(() => historyRef.current.present, []);
  const commit = useCallback(
    (next: NodeMapState) => transition((h) => commitMapHistory(h, next)),
    [transition],
  );
  const preview = useCallback(
    (next: NodeMapState) => transition((h) => previewMapHistory(h, next)),
    [transition],
  );
  const undo = useCallback(() => transition(undoMapHistory), [transition]);
  const redo = useCallback(() => transition(redoMapHistory), [transition]);

  const reset = useCallback(
    (next: NodeMapState) => apply(createMapHistory(next)),
    [apply],
  );

  const beginGroup = useCallback((): MapHistoryGroupLease => {
    const token = nextTokenRef.current + 1;
    nextTokenRef.current = token;
    activeTokenRef.current = token;
    apply(beginMapHistoryGroup(historyRef.current));
    const isActive = () => activeTokenRef.current === token;
    return {
      isActive,
      finish: () => {
        if (!isActive()) return;
        apply(finishMapHistoryGroup(historyRef.current));
      },
    };
  }, [apply]);

  return {
    present: history.present,
    canUndo: canUndoMapHistory(history),
    canRedo: canRedoMapHistory(history),
    getPresent,
    commit,
    preview,
    beginGroup,
    reset,
    undo,
    redo,
  };
}
