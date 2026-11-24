import {
  isDocumentBlocked,
  isNonNodeSelection,
} from "@/domain/map/mapDocumentEditGuards";
import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import type { MapCanvasSelection } from "@/types/mapCanvasSelection";
import type { Node } from "@/types/node";
import type { EditorViewMode } from "@/domain/view/editorViewMode";

export type LayoutPinnedGuardInput = {
  viewMode: EditorViewMode;
  isProtectedMode: boolean;
  hasConflict: boolean;
  isExternallyDeleted: boolean;
  canvasSelection?: MapCanvasSelection;
};

export type LayoutPinnedMenuInput = LayoutPinnedGuardInput & {
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  contextMenuNodeId?: number;
  nodes: readonly Node[];
};

export type LayoutPinnedMenuState = {
  visible: boolean;
  disabled: boolean;
  /** 主選択が既にピンなら解除、でなければ固定 */
  action: "pin" | "unpin";
};

/** ピン座標編集（ドラッグ）の UI ゲート — document／非ノード選択 */
export function isPinnedLayoutEditEnabled(input: LayoutPinnedGuardInput): boolean {
  return !isDocumentBlocked(input) && !isNonNodeSelection(input.canvasSelection);
}

/** N5: コンテキスト／詳細パネル「位置を固定」「固定を解除」 */
export function resolveLayoutPinnedContextMenu(input: LayoutPinnedMenuInput): LayoutPinnedMenuState {
  const {
    viewMode,
    selectedNodeId,
    selectedNodeIds,
    contextMenuNodeId,
    nodes,
    canvasSelection,
  } = input;

  const primary = selectedNodeId === null
    ? null
    : nodes.find((node) => node.id === selectedNodeId) ?? null;
  const action: "pin" | "unpin" = primary?.layoutPinned === true ? "unpin" : "pin";

  const visible = viewMode === "map"
    && selectedNodeId !== null
    && selectedNodeIds.length === 1
    && primary !== null
    && (contextMenuNodeId === undefined || contextMenuNodeId === selectedNodeId);

  if (!visible) return { visible: false, disabled: false, action };

  const disabled = isDocumentBlocked(input)
    || isNonNodeSelection(canvasSelection)
    || !assertNodesEditable([selectedNodeId], nodes).ok;

  return { visible: true, disabled, action };
}

/** N5 詳細パネル: マップかつ主選択1のとき表示。disabled 条件はコンテキストと同型 */
export function resolveLayoutPinnedDetailPanel(input: LayoutPinnedMenuInput): LayoutPinnedMenuState {
  return resolveLayoutPinnedContextMenu({
    ...input,
    contextMenuNodeId: undefined,
  });
}

/** N6: auto 中のピンドラッグが拒否されるか（locked／保護／競合／非ノード選択） */
export function isPinnedNodeDragBlocked(
  input: LayoutPinnedGuardInput & {
    layoutMode: "auto" | "manual";
    node: Node | undefined;
  },
): boolean {
  if (input.layoutMode !== "auto") return true;
  if (input.node === undefined || input.node.layoutPinned !== true) return true;
  if (input.node.locked === true) return true;
  if (isDocumentBlocked(input)) return true;
  if (isNonNodeSelection(input.canvasSelection)) return true;
  return false;
}

export type PinnedNodeDragCallbacksInput = LayoutPinnedGuardInput & {
  layoutMode: "auto" | "manual";
  nodes: readonly Node[];
  movePinnedNode: (id: number, x: number, y: number) => boolean;
  finalizePinnedNodeMove: () => boolean;
};

export type PinnedNodeDragCallbacks = {
  onMovePinnedNode?: (id: number, x: number, y: number) => void;
  onFinalizePinnedNodeMove?: () => boolean;
};

/**
 * MapEditor → stage の N6 配線。
 * document ゲートでコールバックを付け外しし、移動時は isPinnedNodeDragBlocked で拒否する。
 */
export function resolvePinnedNodeDragCallbacks(
  input: PinnedNodeDragCallbacksInput,
): PinnedNodeDragCallbacks {
  if (!isPinnedLayoutEditEnabled(input)) {
    return {};
  }
  const { layoutMode, nodes, movePinnedNode, finalizePinnedNodeMove } = input;
  return {
    onMovePinnedNode: (id, x, y) => {
      const node = nodes.find((candidate) => candidate.id === id);
      if (isPinnedNodeDragBlocked({ ...input, layoutMode, node })) return;
      movePinnedNode(id, x, y);
    },
    onFinalizePinnedNodeMove: finalizePinnedNodeMove,
  };
}
