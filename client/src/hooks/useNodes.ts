import { useState, useCallback, useMemo } from "react";
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
import { deleteNodeOnly as computeNodeOnlyDeletion, type DeleteNodeOnlyResult } from "@/domain/nodes/nodeOnlyDeletion";
import { applyTreeChangeWithOutcome } from "@/hooks/treeChangeOutcome";
import { insertParentNode as computeParentInsertion, type InsertParentNodeResult } from "@/domain/nodes/nodeParentInsertion";
import { replaceNodeImportance, replaceNodesImportance } from "@/domain/nodes/nodeImportanceUpdate";
import {
  isSameNodeMergePlan,
  mergeNodes as computeNodeMerge,
  planNodeMerge,
  type MergeNodesResult,
  type NodeMergePlan,
} from "@/domain/nodes/nodeMerge";
import {
  isSameNodeSplitPlan,
  planNodeSplit,
  splitNode as computeNodeSplit,
  type NodeSplitPlan,
  type SplitNodeResult,
} from "@/domain/nodes/nodeSplit";
import { replaceNodeLabels } from "@/domain/nodes/nodeLabelUpdate";
import { replaceNodeNote } from "@/domain/nodes/nodeNote";
import {
  addNodeLink as computeNodeLinkAddition,
  removeNodeLink as computeNodeLinkRemoval,
  type AddNodeLinkOutcome,
} from "@/domain/nodes/nodeLink";
import {
  addNodeTag as computeNodeTagAddition,
  removeNodeTag as computeNodeTagRemoval,
  type AddNodeTagOutcome,
} from "@/domain/nodes/nodeTag";
import {
  addNodeSource as computeNodeSourceAddition,
  removeNodeSource as computeNodeSourceRemoval,
  type AddNodeSourceOutcome,
  type NodeSourceInput,
} from "@/domain/nodes/nodeSource";
import {
  addNodeMapLink as computeNodeMapLinkAddition,
  removeNodeMapLink as computeNodeMapLinkRemoval,
  type AddNodeMapLinkOutcome,
  type NodeMapLinkInput,
} from "@/domain/nodes/nodeMapLink";
import { clearNodeIllustration, replaceNodeIllustration } from "@/domain/nodes/nodeIllustrationUpdate";
import {
  moveNodeBranch,
  type BranchMoveFailureReason,
} from "@/domain/nodes/nodeBranchMove";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import { useNodeLayoutState } from "@/hooks/useNodeLayoutState";
import type { Node, NodeMapLink } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { NodeMapState } from "@/types/nodeMapState";
import {
  addMarquee,
  addRange,
  clear as clearSelectionState,
  pruneMissing,
  replaceWithMarquee,
  selectOnly,
  toggle,
  type NodeSelectionState,
} from "@/domain/selection/nodeSelection";

export type InsertForestResult =
  | { ok: true; rootId: number; count: number }
  | { ok: false; reason: ForestInsertionFailureReason };

export type MoveBranchResult =
  | { ok: true; rootId: number }
  | { ok: false; reason: BranchMoveFailureReason };

type UseNodesReturn = {
  nodes: Node[];
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  layoutMode: NodeLayoutMode;
  addNode: (x: number, y: number) => number;
  addChildNode: (parentId: number) => number | null;
  addSiblingNode: (nodeId: number) => number | null;
  selectNode: (id: number | null) => void;
  restoreSelection: (selection: NodeSelectionState) => void;
  toggleNodeSelection: (id: number) => void;
  /** Shift範囲選択: アンカー〜target を現在の集合へ加算する（置換ではない。domain の `addRange`）。 */
  selectNodeRange: (targetId: number, visibleNodeIdsOrdered: readonly number[]) => void;
  setSelectionFromMarquee: (args: { mode: "replace" | "add"; ids: readonly number[] }) => void;
  clearSelection: () => void;
  pruneSelectionToVisible: (visibleNodeIds: ReadonlySet<number>) => void;
  updateNodeLabel: (id: number, label: string) => void;
  updateNodeLabels: (replacements: ReadonlyMap<number, string>) => boolean;
  updateNodeImportance: (id: number, importance: NodeImportance) => boolean;
  updateNodesImportance: (ids: readonly number[], importance: NodeImportance) => boolean;
  attachIllustration: (id: number, dataUrl: string) => boolean;
  removeIllustration: (id: number) => boolean;
  // 詳細メモの唯一の更新経路。履歴グループ中は履歴に積まず、グループ外では1操作として確定する。
  // 戻り値は更新を受理したか（無変更・対象不在・上限超過は false）。documentRevision は変えない
  previewNodeNote: (id: number, note: string) => boolean;
  // URL の追加（右パネルの「リンク」節）。最新の状態から判定し、成功なら1操作として確定する。
  // 失敗は理由を返し、何も変えない。documentRevision は変えない
  addNodeLink: (id: number, input: string) => AddNodeLinkOutcome;
  // URL の削除。保存されている値と完全に一致する URL だけを消し、1操作として確定する。受理したかを返す
  removeNodeLink: (id: number, url: string) => boolean;
  // タグの追加（右パネルの「タグ」節）。最新の状態から判定し、成功なら1操作として確定する。
  // 失敗は理由を返し、何も変えない。documentRevision は変えない
  addNodeTag: (id: number, input: string) => AddNodeTagOutcome;
  // タグの削除。保存されている名前と完全に一致するタグだけを消し、1操作として確定する。受理したかを返す
  removeNodeTag: (id: number, tag: string) => boolean;
  // 出典の追加（右パネルの「出典」節）。最新の状態から判定し、成功なら1操作として確定する。
  // 失敗は理由を返し、何も変えない。documentRevision は変えない
  addNodeSource: (id: number, input: NodeSourceInput) => AddNodeSourceOutcome;
  // 出典の削除。指定 index の出典だけを消し、1操作として確定する。受理したかを返す
  removeNodeSource: (id: number, index: number) => boolean;
  // マップ間リンクの追加（右パネルの「マップ間リンク」節）。最新の状態から判定し、成功なら1操作として確定する。
  // 失敗は理由を返し、何も変えない。documentRevision は変えない
  addNodeMapLink: (nodeId: number, currentMapId: string, input: NodeMapLinkInput) => AddNodeMapLinkOutcome;
  // マップ間リンクの削除。値一致（nodeMapLinkKey）するリンクだけを消し、1操作として確定する。受理したかを返す
  removeNodeMapLink: (nodeId: number, target: NodeMapLink) => boolean;
  moveNode: (id: number, x: number, y: number) => void;
  connectNodes: (parentId: number, childId: number) => boolean;
  // 成功時は複製根のIDを返して選択する。対象不在・配置不能・自動配置失敗ではnullを返し何も変えない
  duplicateSubtree: (sourceId: number) => number | null;
  // 最新の状態から枝を専用形式の文字列にする。ノード・選択・履歴は変えない
  copySubtree: (sourceId: number) => SubtreeClipboardResult<string>;
  // dataはdecodeSubtreeClipboardの成功値。選択に依存せず独立した枝として追加し、成功時は新しい根のIDを返して選択する。
  // 配置不能・自動配置失敗ではnullを返し何も変えない
  pasteSubtree: (data: SubtreeClipboardData) => number | null;
  // 任意の部分木を targetParentId（null なら新ルート）へ挿入する。成功時は新しい根の ID を返して選択する
  insertSubtree: (
    sources: readonly Node[],
    sourceRootId: number,
    targetParentId: number | null,
  ) => number | null;
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
  // 最新の状態から計画を作り直し、expected（確認の時点の計画）と違えば何も変えず plan-changed を返す。
  // 成功時は applyTreeChange を1回だけ呼び、選択と documentRevision は変えない。新しい ID は計画が通った後に採番する
  splitNode: (
    nodeId: number,
    separator: string,
    visibleNodeIds: ReadonlySet<number>,
    expected: NodeSplitPlan,
  ) => SplitNodeResult;
  // 最新の状態から計画を作り直し、expected と違えば何も変えず plan-changed を返す。
  // 成功時は applyTreeChange を1回だけ呼び、残したノードだけを選択する。documentRevision は変えない。
  // currentMapId は統合するノード（残すノード・吸収されるノード）を指すマップ間リンクを除くために使う（expected と同じ ID で計画する）
  mergeNodes: (
    ids: readonly number[],
    primaryId: number | null,
    joiner: string,
    visibleNodeIds: ReadonlySet<number>,
    expected: NodeMergePlan,
    currentMapId: string,
  ) => MergeNodesResult;
  moveBranch: (rootId: number, parentId: number | null) => MoveBranchResult;
  deleteNode: (id: number) => void;
  deleteNodeOnly: (nodeId: number, visibleNodeIds: ReadonlySet<number>) => DeleteNodeOnlyResult;
  setLayoutMode: (mode: NodeLayoutMode) => void;
  replaceMap: (state: NodeMapState) => void;
  // 成功したUndo／RedoとreplaceMapで増える。編集・ジェスチャー・生成結果の失効に使う
  documentRevision: number;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => boolean;
  redo: () => boolean;
  // 履歴グループを始める。名前は移動由来だが、機構はグループ一般（詳細メモの途中反映もこのグループを使う）
  beginMoveHistory: () => MapHistoryGroupLease;
};

export function useNodes(): UseNodesReturn {
  const [selection, setSelection] = useState<NodeSelectionState>(() => clearSelectionState());
  const [documentRevision, setDocumentRevision] = useState(0);
  // 採番器はマウントの間ずっと同じものを使う（Undo で消えたノードの ID も以後は再利用しないため）
  const [nodeIdAllocator] = useState<NodeIdAllocator>(() => createNodeIdAllocator());
  const {
    nodes,
    layoutMode,
    getCurrentState,
    applyNonStructuralChange,
    applyNonStructuralPreview,
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

  const selectedNodeId = selection.primaryId;
  const selectedNodeIds = useMemo(
    () => nodes
      .filter((node) => selection.selectedIds.has(node.id))
      .map((node) => node.id),
    [nodes, selection.selectedIds],
  );

  // 復元したマップでは以前の選択と編集対象が無効になるため、選択を外して版を進める
  const markDocumentRestored = useCallback(() => {
    setSelection(clearSelectionState());
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

    setSelection(selectOnly(createdId));
    return createdId;
  }, [nodeIdAllocator, applyTreeChange]);

  const addChildNode = useCallback((parentId: number) => (
    addNodeFromAnchor(parentId, createChildNode)
  ), [addNodeFromAnchor]);

  const addSiblingNode = useCallback((nodeId: number) => (
    addNodeFromAnchor(nodeId, createSiblingNode)
  ), [addNodeFromAnchor]);

  const selectNode = useCallback((id: number | null) => {
    setSelection(id === null ? clearSelectionState() : selectOnly(id));
  }, []);

  const toggleNodeSelection = useCallback((id: number) => {
    const orderedNodeIds = getCurrentState().nodes.map((node) => node.id);
    setSelection((prev) => toggle(prev, id, orderedNodeIds));
  }, [getCurrentState]);

  // 加算（置換ではない）。公開名は設計の selectNodeRange に合わせる
  const selectNodeRange = useCallback((targetId: number, visibleNodeIdsOrdered: readonly number[]) => {
    setSelection((prev) => addRange(prev, targetId, visibleNodeIdsOrdered));
  }, []);

  const setSelectionFromMarquee = useCallback((args: { mode: "replace" | "add"; ids: readonly number[] }) => {
    setSelection((prev) => (
      args.mode === "replace" ? replaceWithMarquee(args.ids) : addMarquee(prev, args.ids)
    ));
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(clearSelectionState());
  }, []);

  const pruneSelectionToVisible = useCallback((visibleNodeIds: ReadonlySet<number>) => {
    const orderedNodeIds = getCurrentState().nodes.map((node) => node.id);
    setSelection((prev) => pruneMissing(prev, visibleNodeIds, orderedNodeIds));
  }, [getCurrentState]);

  const updateNodeLabel = useCallback((id: number, label: string) => {
    applyNonStructuralChange((currentNodes) => (
      currentNodes.map((node) => (
        node.id === id ? { ...node, label } : node
      ))
    ));
  }, [applyNonStructuralChange]);

  // 複数ノードのラベルを1回の更新関数でまとめて変え、1操作として履歴に記録する
  const updateNodeLabels = useCallback((replacements: ReadonlyMap<number, string>) => (
    applyNonStructuralChange((currentNodes) => replaceNodeLabels(currentNodes, replacements))
  ), [applyNonStructuralChange]);

  const updateNodeImportance = useCallback((id: number, importance: NodeImportance) => (
    applyNonStructuralChange((currentNodes) => (
      replaceNodeImportance(currentNodes, id, importance)
    ))
  ), [applyNonStructuralChange]);

  // 選択集合の重要度を1回の更新関数でまとめて変え、1操作として履歴に記録する
  const updateNodesImportance = useCallback((ids: readonly number[], importance: NodeImportance) => (
    applyNonStructuralChange((currentNodes) => (
      replaceNodesImportance(currentNodes, ids, importance)
    ))
  ), [applyNonStructuralChange]);

  const attachIllustration = useCallback((id: number, dataUrl: string) => (
    applyTreeChange((currentNodes) => replaceNodeIllustration(currentNodes, id, dataUrl))
  ), [applyTreeChange]);

  const removeIllustration = useCallback((id: number) => (
    applyTreeChange((currentNodes) => clearNodeIllustration(currentNodes, id))
  ), [applyTreeChange]);

  const previewNodeNote = useCallback((id: number, note: string) => (
    applyNonStructuralPreview((currentNodes) => replaceNodeNote(currentNodes, id, note))
  ), [applyNonStructuralPreview]);

  // 判定と確定は同じ最新の状態（getCurrentState と applyNonStructuralChange は同じ ref を読む）で行う。
  // 同じイベントの中で続けて呼んでも、直前の追加を反映した状態から判定する（L-453）
  const addNodeLink = useCallback((id: number, input: string): AddNodeLinkOutcome => {
    const result = computeNodeLinkAddition(getCurrentState().nodes, id, input);
    if (!result.ok) return { ok: false, reason: result.reason };
    applyNonStructuralChange(() => result.nodes);
    return { ok: true };
  }, [getCurrentState, applyNonStructuralChange]);

  const removeNodeLink = useCallback((id: number, url: string) => (
    applyNonStructuralChange((currentNodes) => computeNodeLinkRemoval(currentNodes, id, url))
  ), [applyNonStructuralChange]);

  // 判定と確定は同じ最新の状態で行う（addNodeLink と同じ。L-453）
  const addNodeTag = useCallback((id: number, input: string): AddNodeTagOutcome => {
    const result = computeNodeTagAddition(getCurrentState().nodes, id, input);
    if (!result.ok) return { ok: false, reason: result.reason };
    applyNonStructuralChange(() => result.nodes);
    return { ok: true };
  }, [getCurrentState, applyNonStructuralChange]);

  const removeNodeTag = useCallback((id: number, tag: string) => (
    applyNonStructuralChange((currentNodes) => computeNodeTagRemoval(currentNodes, id, tag))
  ), [applyNonStructuralChange]);

  // 判定と確定は同じ最新の状態で行う（addNodeTag と同じ。L-001・L-453）
  const addNodeSource = useCallback((id: number, input: NodeSourceInput): AddNodeSourceOutcome => {
    const result = computeNodeSourceAddition(getCurrentState().nodes, id, input);
    if (!result.ok) return { ok: false, reason: result.reason };
    applyNonStructuralChange(() => result.nodes);
    return { ok: true };
  }, [getCurrentState, applyNonStructuralChange]);

  const removeNodeSource = useCallback((id: number, index: number) => (
    applyNonStructuralChange((currentNodes) => computeNodeSourceRemoval(currentNodes, id, index))
  ), [applyNonStructuralChange]);

  // 判定と確定は同じ最新の状態で行う（addNodeSource と同じ。L-001・L-453）
  const addNodeMapLink = useCallback(
    (nodeId: number, currentMapId: string, input: NodeMapLinkInput): AddNodeMapLinkOutcome => {
      const result = computeNodeMapLinkAddition(getCurrentState().nodes, nodeId, currentMapId, input);
      if (!result.ok) return { ok: false, reason: result.reason };
      applyNonStructuralChange(() => result.nodes);
      return { ok: true };
    },
    [getCurrentState, applyNonStructuralChange],
  );

  const removeNodeMapLink = useCallback((nodeId: number, target: NodeMapLink) => (
    applyNonStructuralChange((currentNodes) => computeNodeMapLinkRemoval(currentNodes, nodeId, target))
  ), [applyNonStructuralChange]);

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

    setSelection(selectOnly(childId));
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

    setSelection(selectOnly(insertedRootId));
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

  // 部品挿入など、任意の部分木を targetParentId（null なら新ルート）へ挿入する
  const insertSubtree = useCallback((
    sources: readonly Node[],
    sourceRootId: number,
    targetParentId: number | null,
  ) => (
    applySubtreeInsertion((currentNodes, mode, allocateIds) => (
      insertNodeSubtree(
        currentNodes,
        sources,
        sourceRootId,
        targetParentId,
        mode,
        allocateIds,
        "paste",
      )
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
    if (settled.ok) setSelection(selectOnly(settled.insertedId));
    return settled;
  }, [nodeIdAllocator, applyTreeChange]);

  // 計画は描画時の配列ではなく、確定時点の最新の配列から作り直す。新しい ID は計画が通った後にまとめて 1 回採番し、
  // 自動配置の失敗などで確定しなかった ID は欠番のままにする（allocator を巻き戻さない）。
  // 分割は編集中の折りたたみや通知を保つため、選択と documentRevision を変えない
  const splitNode = useCallback((
    nodeId: number,
    separator: string,
    visibleNodeIds: ReadonlySet<number>,
    expected: NodeSplitPlan,
  ): SplitNodeResult => (
    applyTreeChangeWithOutcome<SplitNodeResult>(applyTreeChange, (currentNodes) => {
      const fresh = planNodeSplit(currentNodes, nodeId, separator, visibleNodeIds);
      if (!fresh.ok) return { nodes: null, outcome: fresh };
      if (!isSameNodeSplitPlan(fresh, expected)) return { nodes: null, outcome: { ok: false, reason: "plan-changed" } };

      const newNodeIds = nodeIdAllocator.nextAvailableIds(currentNodes, fresh.fragments.length - 1);
      const split = computeNodeSplit(currentNodes, nodeId, separator, newNodeIds, visibleNodeIds);
      if (!split.ok) return { nodes: null, outcome: split };
      return { nodes: split.nodes, outcome: { ok: true, insertedIds: split.insertedIds } };
    })
  ), [nodeIdAllocator, applyTreeChange]);

  // 統合は成功したら、残したノードだけを選択する。選択に残った吸収されるノードの ID は、ここで置き換わる
  const mergeNodes = useCallback((
    ids: readonly number[],
    primaryId: number | null,
    joiner: string,
    visibleNodeIds: ReadonlySet<number>,
    expected: NodeMergePlan,
    currentMapId: string,
  ): MergeNodesResult => {
    const settled = applyTreeChangeWithOutcome<MergeNodesResult>(applyTreeChange, (currentNodes, mode) => {
      const fresh = planNodeMerge(currentNodes, ids, primaryId, joiner, visibleNodeIds, currentMapId);
      if (!fresh.ok) return { nodes: null, outcome: fresh };
      if (!isSameNodeMergePlan(fresh, expected)) return { nodes: null, outcome: { ok: false, reason: "plan-changed" } };

      const merged = computeNodeMerge(currentNodes, ids, primaryId, joiner, visibleNodeIds, mode, currentMapId);
      if (!merged.ok) return { nodes: null, outcome: merged };
      return {
        nodes: merged.nodes,
        outcome: { ok: true, survivorId: merged.survivorId, absorbedCount: merged.absorbedIds.length },
      };
    });
    if (settled.ok) setSelection(selectOnly(settled.survivorId));
    return settled;
  }, [applyTreeChange]);

  const moveBranch = useCallback((rootId: number, parentId: number | null): MoveBranchResult => {
    const settled = applyTreeChangeWithOutcome<MoveBranchResult>(applyTreeChange, (currentNodes, mode) => {
      const moved = moveNodeBranch(currentNodes, rootId, parentId, mode);
      if (!moved.ok) return { nodes: null, outcome: moved };
      return { nodes: moved.nodes, outcome: { ok: true, rootId: moved.rootId } };
    });
    if (settled.ok) setSelection(selectOnly(settled.rootId));
    return settled;
  }, [applyTreeChange]);

  // 最新の全ノードから候補を一度だけ確定し、成功した削除対象だけ選択解除する。
  const deleteNodeOnly = useCallback((
    nodeId: number,
    visibleNodeIds: ReadonlySet<number>,
  ): DeleteNodeOnlyResult => {
    const settled = applyTreeChangeWithOutcome<DeleteNodeOnlyResult>(applyTreeChange, (currentNodes, mode) => {
      const deleted = computeNodeOnlyDeletion(currentNodes, nodeId, visibleNodeIds, mode);
      if (!deleted.ok) return { nodes: null, outcome: deleted };
      return { nodes: deleted.nodes, outcome: { ok: true, deletedId: deleted.deletedId } };
    });
    if (settled.ok) {
      const remaining = getCurrentState().nodes;
      const remainingIds = new Set(remaining.map((node) => node.id));
      const orderedNodeIds = remaining.map((node) => node.id);
      setSelection((prev) => pruneMissing(prev, remainingIds, orderedNodeIds));
    }
    return settled;
  }, [applyTreeChange, getCurrentState]);

  const deleteNode = useCallback((id: number) => {
    let subtreeIds = new Set<number>();
    const applied = applyTreeChange((currentNodes) => {
      subtreeIds = collectSubtreeIds(currentNodes, id);
      return currentNodes.filter((node) => !subtreeIds.has(node.id));
    });
    if (!applied) return;

    const remaining = getCurrentState().nodes;
    const remainingIds = new Set(remaining.map((node) => node.id));
    const orderedNodeIds = remaining.map((node) => node.id);
    setSelection((prev) => pruneMissing(prev, remainingIds, orderedNodeIds));
  }, [applyTreeChange, getCurrentState]);

  return {
    nodes,
    selectedNodeId,
    selectedNodeIds,
    layoutMode,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    restoreSelection: setSelection,
    toggleNodeSelection,
    selectNodeRange,
    setSelectionFromMarquee,
    clearSelection,
    pruneSelectionToVisible,
    updateNodeLabel,
    updateNodeLabels,
    updateNodeImportance,
    updateNodesImportance,
    attachIllustration,
    removeIllustration,
    previewNodeNote,
    addNodeLink,
    removeNodeLink,
    addNodeTag,
    removeNodeTag,
    addNodeSource,
    removeNodeSource,
    addNodeMapLink,
    removeNodeMapLink,
    moveNode,
    connectNodes,
    duplicateSubtree,
    copySubtree,
    pasteSubtree,
    insertSubtree,
    insertForest,
    reorderSibling,
    changeNodeIndent,
    insertParentNode,
    splitNode,
    mergeNodes,
    moveBranch,
    deleteNode,
    deleteNodeOnly,
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
