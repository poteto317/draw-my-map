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
  // 現在有効なグループのトークン。null ならグループなし
  const activeTokenRef = useRef<number | null>(null);
  const nextTokenRef = useRef(0);

  const apply = useCallback((next: MapHistoryState) => {
    historyRef.current = next;
    setHistory(next);
  }, []);

  const transition = useCallback(
    (step: (current: MapHistoryState) => MapHistoryState, invalidateGroup: boolean): boolean => {
      const before = historyRef.current;
      const after = step(before);
      if (invalidateGroup) activeTokenRef.current = null;
      if (after !== before) apply(after);
      return !areMapStatesEqual(before.present, after.present);
    },
    [apply],
  );

  const getPresent = useCallback(() => historyRef.current.present, []);
  const commit = useCallback(
    (next: NodeMapState) => transition((h) => commitMapHistory(h, next), true),
    [transition],
  );
  const preview = useCallback(
    (next: NodeMapState) => transition((h) => previewMapHistory(h, next), false),
    [transition],
  );
  const undo = useCallback(() => transition(undoMapHistory, true), [transition]);
  const redo = useCallback(() => transition(redoMapHistory, true), [transition]);

  const reset = useCallback(
    (next: NodeMapState) => {
      activeTokenRef.current = null;
      apply(createMapHistory(next));
    },
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
        activeTokenRef.current = null;
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
