import {
  isDocumentBlocked,
  isNonNodeSelection,
} from "@/domain/map/mapDocumentEditGuards";
import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { effectiveBranchDirection, buildParentById } from "@/domain/nodes/nodeBranchLayout";
import type { BranchLayout, BranchLayoutDirection } from "@/types/branchLayout";
import type { LayoutStyle } from "@/types/layoutStyle";
import type { MapCanvasSelection } from "@/types/mapCanvasSelection";
import type { Node } from "@/types/node";
import type { TreeDirection } from "@/types/treeDirection";
import type { EditorViewMode } from "@/domain/view/editorViewMode";

export type BranchLayoutGuardInput = {
  viewMode: EditorViewMode;
  isProtectedMode: boolean;
  hasConflict: boolean;
  isExternallyDeleted: boolean;
  canvasSelection?: MapCanvasSelection;
};

export type BranchLayoutMenuInput = BranchLayoutGuardInput & {
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  contextMenuNodeId?: number;
  nodes: readonly Node[];
  layoutStyle: LayoutStyle | undefined;
  branchLayouts: readonly BranchLayout[] | undefined;
  treeDirection?: TreeDirection;
};

export type BranchLayoutMenuState = {
  visible: boolean;
  disabled: boolean;
  /** 主選択に効いている方向（エントリまたは文書既定） */
  currentDirection: BranchLayoutDirection;
  /** 主選択に明示エントリがあるか（「文書の既定に戻す」の活性用） */
  hasExplicitEntry: boolean;
};

/** N4: コンテキスト「この枝の配置方向」 */
export function resolveBranchLayoutContextMenu(input: BranchLayoutMenuInput): BranchLayoutMenuState {
  const {
    viewMode,
    selectedNodeId,
    selectedNodeIds,
    contextMenuNodeId,
    nodes,
    canvasSelection,
    layoutStyle,
    branchLayouts,
    treeDirection,
  } = input;

  const documentDirection: TreeDirection = treeDirection ?? "lr";
  const primary = selectedNodeId === null
    ? null
    : nodes.find((node) => node.id === selectedNodeId) ?? null;

  const currentDirection = primary === null
    ? documentDirection
    : effectiveBranchDirection(
      primary.id,
      branchLayouts,
      documentDirection,
      buildParentById(nodes),
    );
  const hasExplicitEntry = primary !== null
    && (branchLayouts?.some((entry) => entry.nodeId === primary.id) ?? false);

  const visible = viewMode === "map"
    && selectedNodeId !== null
    && selectedNodeIds.length === 1
    && primary !== null
    && (contextMenuNodeId === undefined || contextMenuNodeId === selectedNodeId);

  if (!visible) {
    return { visible: false, disabled: false, currentDirection, hasExplicitEntry };
  }

  const disabled = isDocumentBlocked(input)
    || isNonNodeSelection(canvasSelection)
    || layoutStyle === "radial"
    || !assertNodesEditable([selectedNodeId], nodes).ok;

  return { visible: true, disabled, currentDirection, hasExplicitEntry };
}
