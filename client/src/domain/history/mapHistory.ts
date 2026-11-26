import { areCustomAttributesEqual, areNodeTasksEqual } from "@/domain/nodes/nodeTaskAttributes";
import { areGroupsEqual, areRelationsEqual } from "@/domain/map/relationGroupModel";
import { areLayoutSpacingEqual } from "@/domain/persistence/mapDocumentLayoutSpacing";
import { areLabelTextStylesEqual } from "@/domain/nodes/labelTextStyle";
import { areNodeMapLinksEqual } from "@/domain/nodes/nodeMapLink";
import { areNodeSourcesEqual } from "@/domain/nodes/nodeSource";
import { areBranchLayoutsEqual } from "@/types/branchLayout";
import { areLayoutStylesEqual } from "@/types/layoutStyle";
import { areMapLearnsEqual } from "@/types/mapLearn";
import { areMapToursEqual } from "@/types/mapTour";
import type { Node, NodeMapLink, NodeSource } from "@/types/node";
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
  /** グループ中の preview を破棄し groupStart へ戻す（past には積まない） */
  cancel: () => void;
};

export function createMapHistory(initial: NodeMapState): MapHistoryState {
  return { past: [], present: initial, future: [], groupStart: null };
}

// 配列の値（links・tags）は要素ごとに比べる。sources は areNodeSourcesEqual、mapLinks は areNodeMapLinksEqual。
// labelFontSize / labelBold / labelUnderline は areLabelTextStylesEqual（欠落＝標準）で比べる。
// icon / kind はキー有無ごと（欠落＝無し）に比べる。
// 別の配列でも内容が同じなら、実変更の無い履歴を積まない（L-135）
function areArrayValuesEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function areNodesEqual(a: Node, b: Node): boolean {
  if (a === b) return true;
  // 書式キーは欠落＝標準としてまとめて比べる（キー有無の差だけでは履歴を積まない）
  if (!areLabelTextStylesEqual(a, b)) return false;
  // Node は型エイリアスのため、キャストなしで任意のキーを読める型へ代入できる（illustration・links・tags・sources・mapLinks・labelFontSize・labelBold・labelUnderline・icon・kind の有無も比較する）
  if (!areNodeTasksEqual(a.task, b.task) || !areCustomAttributesEqual(a.customAttributes, b.customAttributes)) return false;
  const left: Readonly<Record<string, unknown>> = a;
  const right: Readonly<Record<string, unknown>> = b;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (key === "task" || key === "customAttributes") continue;
    if (key === "labelFontSize" || key === "labelBold" || key === "labelUnderline") continue;
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue === rightValue) continue;
    if (key === "sources") {
      if (
        areNodeSourcesEqual(
          leftValue as readonly NodeSource[] | undefined,
          rightValue as readonly NodeSource[] | undefined,
        )
      ) {
        continue;
      }
      return false;
    }
    if (key === "mapLinks") {
      if (
        areNodeMapLinksEqual(
          leftValue as readonly NodeMapLink[] | undefined,
          rightValue as readonly NodeMapLink[] | undefined,
        )
      ) {
        continue;
      }
      return false;
    }
    if (Array.isArray(leftValue) && Array.isArray(rightValue) && areArrayValuesEqual(leftValue, rightValue)) continue;
    return false;
  }
  return true;
}

export function areMapStatesEqual(a: NodeMapState, b: NodeMapState): boolean {
  if (a === b) return true;
  if (a.layoutMode !== b.layoutMode || a.nodes.length !== b.nodes.length) return false;
  if ((a.treeDirection ?? "lr") !== (b.treeDirection ?? "lr")) return false;
  if (!areLayoutSpacingEqual(a.layoutSpacing, b.layoutSpacing)) return false;
  if (!areLayoutStylesEqual(a.layoutStyle, b.layoutStyle)) return false;
  if (!areBranchLayoutsEqual(a.branchLayouts, b.branchLayouts)) return false;
  if (!areRelationsEqual(a.relations, b.relations)) return false;
  if (!areGroupsEqual(a.groups, b.groups)) return false;
  if (!areMapToursEqual(a.tour, b.tour)) return false;
  if (!areMapLearnsEqual(a.learn, b.learn)) return false;
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

/** グループを破棄して present を開始時点へ戻す。past / future は触らない。 */
export function cancelMapHistoryGroup(history: MapHistoryState): MapHistoryState {
  const { groupStart } = history;
  if (groupStart === null) return history;
  return {
    ...history,
    present: groupStart,
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
