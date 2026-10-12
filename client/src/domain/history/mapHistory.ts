import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

export const MAP_HISTORY_LIMIT = 100;

export type MapHistoryState = {
  // 末尾が直前の状態
  past: NodeMapState[];
  present: NodeMapState;
  // 先頭が次の状態
  future: NodeMapState[];
  // 操作グループ中は開始時点の状態。グループ外ではnull
  groupStart: NodeMapState | null;
};

export type MapHistoryGroupLease = {
  isActive: () => boolean;
  finish: () => void;
};

export function createMapHistory(initial: NodeMapState): MapHistoryState {
  return { past: [], present: initial, future: [], groupStart: null };
}

function areNodesEqual(a: Node, b: Node): boolean {
  if (a === b) return true;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

export function areMapStatesEqual(a: NodeMapState, b: NodeMapState): boolean {
  if (a === b) return true;
  if (a.layoutMode !== b.layoutMode || a.nodes.length !== b.nodes.length) return false;
  return a.nodes.every((node, index) => areNodesEqual(node, b.nodes[index]));
}

function appendPast(past: NodeMapState[], entry: NodeMapState): NodeMapState[] {
  return [...past, entry].slice(-MAP_HISTORY_LIMIT);
}

export function finishMapHistoryGroup(history: MapHistoryState): MapHistoryState {
  const { groupStart } = history;
  if (groupStart === null) return history;
  if (areMapStatesEqual(groupStart, history.present)) return { ...history, groupStart: null };
  return {
    ...history,
    past: appendPast(history.past, groupStart),
    future: [],
    groupStart: null,
  };
}

export function commitMapHistory(history: MapHistoryState, next: NodeMapState): MapHistoryState {
  const closed = finishMapHistoryGroup(history);
  if (areMapStatesEqual(closed.present, next)) return closed;
  return {
    past: appendPast(closed.past, closed.present),
    present: next,
    future: [],
    groupStart: null,
  };
}

export function previewMapHistory(history: MapHistoryState, next: NodeMapState): MapHistoryState {
  if (history.groupStart === null) return commitMapHistory(history, next);
  if (areMapStatesEqual(history.present, next)) return history;
  return { ...history, present: next };
}

export function beginMapHistoryGroup(history: MapHistoryState): MapHistoryState {
  const closed = finishMapHistoryGroup(history);
  return { ...closed, groupStart: closed.present };
}

export function undoMapHistory(history: MapHistoryState): MapHistoryState {
  const closed = finishMapHistoryGroup(history);
  if (closed.past.length === 0) return closed;
  return {
    past: closed.past.slice(0, -1),
    present: closed.past[closed.past.length - 1],
    future: [closed.present, ...closed.future],
    groupStart: null,
  };
}

export function redoMapHistory(history: MapHistoryState): MapHistoryState {
  const closed = finishMapHistoryGroup(history);
  if (closed.future.length === 0) return closed;
  return {
    past: appendPast(closed.past, closed.present),
    present: closed.future[0],
    future: closed.future.slice(1),
    groupStart: null,
  };
}

// 操作グループ中に実変更があるか。グループを閉じると past へ積まれ、future は捨てられる
function hasPendingGroupChange(history: MapHistoryState): boolean {
  return history.groupStart !== null && !areMapStatesEqual(history.groupStart, history.present);
}

// finishMapHistoryGroup と同じ結果を、配列を作らずに判定する
export function canUndoMapHistory(history: MapHistoryState): boolean {
  return history.past.length > 0 || hasPendingGroupChange(history);
}

export function canRedoMapHistory(history: MapHistoryState): boolean {
  return !hasPendingGroupChange(history) && history.future.length > 0;
}
