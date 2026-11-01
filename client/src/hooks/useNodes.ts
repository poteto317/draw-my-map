import { useState, useCallback } from "react";
import {
  createChildNode,
  createRootNode,
  createSiblingNode,
} from "@/domain/nodes/nodePlacement";
import {
  collectSubtreeIds,
  connectNodeTree,
  moveNodeSubtree,
} from "@/domain/nodes/nodeTree";
import {
  createNodeIdAllocator,
  type NodeIdAllocator,
} from "@/domain/nodes/nodeIdAllocator";
import { duplicateNodeSubtree } from "@/domain/nodes/nodeSubtreeDuplication";
import {
  type AllocateNodeIds,
  insertNodeSubtree,
  type SubtreeInsertionResult,
} from "@/domain/nodes/nodeSubtreeInsertion";
import {
  type ForestInsertionFailureReason,
  type ForestInsertionTarget,
  type ForestItem,
  insertNodeForest,
} from "@/domain/nodes/nodeForestInsertion";
import {
  encodeSubtreeClipboard,
  type SubtreeClipboardData,
  type SubtreeClipboardResult,
} from "@/domain/clipboard/subtreeClipboardCodec";
import {
  reorderSiblingByRequest,
  type ReorderSiblingResult,
  type SiblingReorderRequest,
} from "@/domain/nodes/nodeSiblingOrder";
import {
  changeNodeIndent as computeNodeIndent,
  type ChangeNodeIndentResult,
  type NodeIndentDirection,
} from "@/domain/nodes/nodeIndent";
import { applyTreeChangeWithOutcome } from "@/hooks/treeChangeOutcome";
import { insertParentNode as computeParentInsertion, type InsertParentNodeResult } from "@/domain/nodes/nodeParentInsertion";
import { replaceNodeImportance } from "@/domain/nodes/nodeImportanceUpdate";
import { clearNodeIllustration, replaceNodeIllustration } from "@/domain/nodes/nodeIllustrationUpdate";
import {
  moveNodeBranch,
  type BranchMoveFailureReason,
} from "@/domain/nodes/nodeBranchMove";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import { useNodeLayoutState } from "@/hooks/useNodeLayoutState";
import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { NodeMapState } from "@/types/nodeMapState";

export type InsertForestResult =
  | { ok: true; rootId: number; count: number }
  | { ok: false; reason: ForestInsertionFailureReason };

export type MoveBranchResult =
  | { ok: true; rootId: number }
  | { ok: false; reason: BranchMoveFailureReason };

type UseNodesReturn = {
  nodes: Node[];
  selectedNodeId: number | null;
  layoutMode: NodeLayoutMode;
  addNode: (x: number, y: number) => number;
  addChildNode: (parentId: number) => number | null;
  addSiblingNode: (nodeId: number) => number | null;
  selectNode: (id: number | null) => void;
  updateNodeLabel: (id: number, label: string) => void;
  updateNodeImportance: (id: number, importance: NodeImportance) => boolean;
  attachIllustration: (id: number, dataUrl: string) => boolean;
  removeIllustration: (id: number) => boolean;
  moveNode: (id: number, x: number, y: number) => void;
  connectNodes: (parentId: number, childId: number) => boolean;
  // 成功時は複製根のIDを返して選択する。対象不在・配置不能・自動配置失敗ではnullを返し何も変えない
  duplicateSubtree: (sourceId: number) => number | null;
  // 最新の状態から枝を専用形式の文字列にする。ノード・選択・履歴は変えない
  copySubtree: (sourceId: number) => SubtreeClipboardResult<string>;
  // dataはdecodeSubtreeClipboardの成功値。選択に依存せず独立した枝として追加し、成功時は新しい根のIDを返して選択する。
  // 配置不能・自動配置失敗ではnullを返し何も変えない
  pasteSubtree: (data: SubtreeClipboardData) => number | null;
  // 箇条書きの項目を森として1回の操作で追加し、成功時は最初の根を選択する。失敗時は理由を返し何も変えない
  insertForest: (items: readonly ForestItem[], target: ForestInsertionTarget) => InsertForestResult;
  // 見えている兄弟の中で並べ替える。applyTreeChange を1回だけ呼び、選択と documentRevision は変えない。失敗時は何も変えない
  reorderSibling: (
    nodeId: number,
    request: SiblingReorderRequest,
    visibleNodeIds: ReadonlySet<number>,
  ) => ReorderSiblingResult;
  // 見えている直前の兄弟の子にする／親の兄弟にする。applyTreeChange を1回だけ呼び、選択と documentRevision は変えない。失敗時は何も変えない
  changeNodeIndent: (
    nodeId: number,
    direction: NodeIndentDirection,
    visibleNodeIds: ReadonlySet<number>,
  ) => ChangeNodeIndentResult;
  // nodeId のノードと親の間に新しいノードを入れる。applyTreeChange を1回だけ呼び、成功時は新しいノードを選択する。
  // documentRevision は変えない。失敗時は何も変えない
  insertParentNode: (
    nodeId: number,
    visibleNodeIds: ReadonlySet<number>,
  ) => InsertParentNodeResult;
  moveBranch: (rootId: number, parentId: number | null) => MoveBranchResult;
  deleteNode: (id: number) => void;
  setLayoutMode: (mode: NodeLayoutMode) => void;
  replaceMap: (state: NodeMapState) => void;
  // 成功したUndo／RedoとreplaceMapで増える。編集・ジェスチャー・生成結果の失効に使う
  documentRevision: number;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => boolean;
  redo: () => boolean;
  beginMoveHistory: () => MapHistoryGroupLease;
};

export function useNodes(): UseNodesReturn {
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [documentRevision, setDocumentRevision] = useState(0);
  // 採番器はマウントの間ずっと同じものを使う（Undo で消えたノードの ID も以後は再利用しないため）
  const [nodeIdAllocator] = useState<NodeIdAllocator>(() => createNodeIdAllocator());
  const {
    nodes,
    layoutMode,
    getCurrentState,
    applyNonStructuralChange,
    applyManualMove,
    applyTreeChange,
    setLayoutMode,
    replaceLayoutState,
    canUndo,
    canRedo,
    undo: undoLayout,
    redo: redoLayout,
    beginMoveHistory,
  } = useNodeLayoutState();

  // 復元したマップでは以前の選択と編集対象が無効になるため、選択を外して版を進める
  const markDocumentRestored = useCallback(() => {
    setSelectedNodeId(null);
    setDocumentRevision((revision) => revision + 1);
  }, []);

  const replaceMap = useCallback((state: NodeMapState) => {
    nodeIdAllocator.reset();
    replaceLayoutState(state.nodes, state.layoutMode);
    markDocumentRestored();
  }, [nodeIdAllocator, replaceLayoutState, markDocumentRestored]);

  // ID allocatorはresetしない。Undoで消えたノードのIDも以後の追加で再利用しない
  const undo = useCallback(() => {
    const restored = undoLayout();
    if (restored) markDocumentRestored();
    return restored;
  }, [undoLayout, markDocumentRestored]);

  const redo = useCallback(() => {
    const restored = redoLayout();
    if (restored) markDocumentRestored();
    return restored;
  }, [redoLayout, markDocumentRestored]);

  const addNode = useCallback((x: number, y: number) => {
    let id!: number;
    applyTreeChange((currentNodes) => {
      id = nodeIdAllocator.nextAvailableId(currentNodes);
      return [...currentNodes, createRootNode(id, x, y)];
    });
    return id;
  }, [nodeIdAllocator, applyTreeChange]);

  // 基点のノード（子なら親、兄弟なら元のノード）から1つ作って追加し、作ったノードを選択してそのIDを返す。
  // 基点が無い・作れないときは何も変えずに null を返す。ID は確定時点の最新の配列から採番する
  const addNodeFromAnchor = useCallback((
    anchorId: number,
    createNode: (currentNodes: readonly Node[], anchorId: number, id: number) => Node | null,
  ) => {
    let createdId: number | null = null;
    const applied = applyTreeChange((currentNodes) => {
      if (!currentNodes.some((node) => node.id === anchorId)) return null;
      const id = nodeIdAllocator.nextAvailableId(currentNodes);
      const created = createNode(currentNodes, anchorId, id);
      if (!created) return null;

      createdId = id;
      return [...currentNodes, created];
    });
    if (!applied || createdId === null) return null;

    setSelectedNodeId(createdId);
    return createdId;
  }, [nodeIdAllocator, applyTreeChange]);

  const addChildNode = useCallback((parentId: number) => (
    addNodeFromAnchor(parentId, createChildNode)
  ), [addNodeFromAnchor]);

  const addSiblingNode = useCallback((nodeId: number) => (
    addNodeFromAnchor(nodeId, createSiblingNode)
  ), [addNodeFromAnchor]);

  const selectNode = useCallback((id: number | null) => {
    setSelectedNodeId(id);
  }, []);

  const updateNodeLabel = useCallback((id: number, label: string) => {
    applyNonStructuralChange((currentNodes) => (
      currentNodes.map((node) => (
        node.id === id ? { ...node, label } : node
      ))
    ));
  }, [applyNonStructuralChange]);

  const updateNodeImportance = useCallback((id: number, importance: NodeImportance) => (
    applyNonStructuralChange((currentNodes) => (
      replaceNodeImportance(currentNodes, id, importance)
    ))
  ), [applyNonStructuralChange]);

  const attachIllustration = useCallback((id: number, dataUrl: string) => (
    applyTreeChange((currentNodes) => replaceNodeIllustration(currentNodes, id, dataUrl))
  ), [applyTreeChange]);

  const removeIllustration = useCallback((id: number) => (
    applyTreeChange((currentNodes) => clearNodeIllustration(currentNodes, id))
  ), [applyTreeChange]);

  const moveNode = useCallback((id: number, x: number, y: number) => {
    applyManualMove((currentNodes) => (
      moveNodeSubtree(currentNodes, id, x, y)
    ));
  }, [applyManualMove]);

  const connectNodes = useCallback((parentId: number, childId: number) => {
    const applied = applyTreeChange((currentNodes) => (
      connectNodeTree(currentNodes, parentId, childId)
    ));
    if (!applied) return false;

    setSelectedNodeId(childId);
    return true;
  }, [applyTreeChange]);

  // 枝や森を挿入する1回の構造変更を適用し、成功時は新しい根（森では最初の根）を選択してそのIDを返す。
  // 採番済みで確定しなかったIDは欠番のままにし、allocatorを巻き戻さない
  const applySubtreeInsertion = useCallback((
    insert: (
      currentNodes: readonly Node[],
      mode: NodeLayoutMode,
      allocateIds: AllocateNodeIds,
    ) => SubtreeInsertionResult | null,
  ) => {
    let insertedRootId: number | null = null;
    const applied = applyTreeChange((currentNodes, mode) => {
      const inserted = insert(
        currentNodes,
        mode,
        (occupied, count) => nodeIdAllocator.nextAvailableIds(occupied, count),
      );
      if (!inserted) return null;

      insertedRootId = inserted.rootId;
      return inserted.nodes;
    });
    if (!applied || insertedRootId === null) return null;

    setSelectedNodeId(insertedRootId);
    return insertedRootId;
  }, [nodeIdAllocator, applyTreeChange]);

  const duplicateSubtree = useCallback((sourceId: number) => (
    applySubtreeInsertion((currentNodes, mode, allocateIds) => (
      duplicateNodeSubtree(currentNodes, sourceId, mode, allocateIds)
    ))
  ), [applySubtreeInsertion]);

  const copySubtree = useCallback((sourceId: number) => (
    encodeSubtreeClipboard(getCurrentState().nodes, sourceId)
  ), [getCurrentState]);

  const pasteSubtree = useCallback((data: SubtreeClipboardData) => (
    applySubtreeInsertion((currentNodes, mode, allocateIds) => (
      insertNodeSubtree(currentNodes, data.nodes, data.rootId, null, mode, allocateIds, "paste")
    ))
  ), [applySubtreeInsertion]);

  const insertForest = useCallback((
    items: readonly ForestItem[],
    target: ForestInsertionTarget,
  ): InsertForestResult => {
    let failureReason: ForestInsertionFailureReason | null = null;
    const rootId = applySubtreeInsertion((currentNodes, mode, allocateIds) => {
      const inserted = insertNodeForest(currentNodes, items, target, mode, allocateIds);
      if (!inserted.ok) {
        failureReason = inserted.reason;
        return null;
      }
      return { nodes: inserted.nodes, rootId: inserted.rootIds[0] };
    });
    // 候補を作れた後に失敗するのは、全体の自動配置だけ
    if (rootId === null) return { ok: false, reason: failureReason ?? "placement-failed" };
    return { ok: true, rootId, count: items.length };
  }, [applySubtreeInsertion]);

  // 「1つ上・1つ下」は描画時の配列ではなく、確定時点の最新の配列から挿入先を解決する。
  // 並べ替えは編集中の折りたたみや通知を保つため、documentRevision を上げない
  const reorderSibling = useCallback((
    nodeId: number,
    request: SiblingReorderRequest,
    visibleNodeIds: ReadonlySet<number>,
  ): ReorderSiblingResult => (
    applyTreeChangeWithOutcome<ReorderSiblingResult>(applyTreeChange, (currentNodes, mode) => {
      const reordered = reorderSiblingByRequest(currentNodes, nodeId, request, visibleNodeIds, mode);
      if (!reordered.ok) return { nodes: null, outcome: reordered };
      const { nodes, ...position } = reordered;
      return { nodes, outcome: position };
    })
  ), [applyTreeChange]);

  // 新しい親は描画時の配列ではなく、確定時点の最新の配列から解決する。
  // 上げ下げは編集中の折りたたみや通知を保つため、documentRevision を上げない
  const changeNodeIndent = useCallback((
    nodeId: number,
    direction: NodeIndentDirection,
    visibleNodeIds: ReadonlySet<number>,
  ): ChangeNodeIndentResult => (
    applyTreeChangeWithOutcome<ChangeNodeIndentResult>(applyTreeChange, (currentNodes, mode) => {
      const changed = computeNodeIndent(currentNodes, nodeId, direction, visibleNodeIds, mode);
      if (!changed.ok) return { nodes: null, outcome: changed };
      const { nodes, ...summary } = changed;
      return { nodes, outcome: summary };
    })
  ), [applyTreeChange]);

  // 新しい ID は確定時点の最新の配列から採番する。確定しなかった ID は欠番のままにする。
  // 挿入は編集中の折りたたみや通知を保つため、documentRevision を上げない
  const insertParentNode = useCallback((
    nodeId: number,
    visibleNodeIds: ReadonlySet<number>,
  ): InsertParentNodeResult => {
    const settled = applyTreeChangeWithOutcome<InsertParentNodeResult>(applyTreeChange, (currentNodes, mode) => {
      const id = nodeIdAllocator.nextAvailableId(currentNodes);
      const inserted = computeParentInsertion(currentNodes, nodeId, id, visibleNodeIds, mode);
      if (!inserted.ok) return { nodes: null, outcome: inserted };
      const { nodes, ...summary } = inserted;
      return { nodes, outcome: summary };
    });
    if (settled.ok) setSelectedNodeId(settled.insertedId);
    return settled;
  }, [nodeIdAllocator, applyTreeChange]);

  const moveBranch = useCallback((rootId: number, parentId: number | null): MoveBranchResult => {
    const settled = applyTreeChangeWithOutcome<MoveBranchResult>(applyTreeChange, (currentNodes, mode) => {
      const moved = moveNodeBranch(currentNodes, rootId, parentId, mode);
      if (!moved.ok) return { nodes: null, outcome: moved };
      return { nodes: moved.nodes, outcome: { ok: true, rootId: moved.rootId } };
    });
    if (settled.ok) setSelectedNodeId(settled.rootId);
    return settled;
  }, [applyTreeChange]);

  const deleteNode = useCallback((id: number) => {
    let subtreeIds = new Set<number>();
    const applied = applyTreeChange((currentNodes) => {
      subtreeIds = collectSubtreeIds(currentNodes, id);
      return currentNodes.filter((node) => !subtreeIds.has(node.id));
    });
    if (!applied) return;

    const deletedIds = subtreeIds;
    setSelectedNodeId((prev) => (
      prev !== null && deletedIds.has(prev) ? null : prev
    ));
  }, [applyTreeChange]);

  return {
    nodes,
    selectedNodeId,
    layoutMode,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    updateNodeLabel,
    updateNodeImportance,
    attachIllustration,
    removeIllustration,
    moveNode,
    connectNodes,
    duplicateSubtree,
    copySubtree,
    pasteSubtree,
    insertForest,
    reorderSibling,
    changeNodeIndent,
    insertParentNode,
    moveBranch,
    deleteNode,
    setLayoutMode,
    replaceMap,
    documentRevision,
    canUndo,
    canRedo,
    undo,
    redo,
    beginMoveHistory,
  };
}
