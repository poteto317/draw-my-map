import {
  computeNodeCustomAttributeUpdate,
  computeNodeTaskUpdate,
  normalizeTaskForEdit,
  type NodeCustomAttributeUpdateComputation,
  type NodeTaskUpdateComputation,
} from "@/domain/nodes/nodeTaskUpdate";
import {
  interpretCustomAttributeUpdateOutcome,
  interpretTaskUpdateOutcome,
} from "@/domain/nodes/nodeTaskUpdateOutcome";
import type { EditOutcome } from "@/hooks/useNodeTaskAttributeEditing";
import type { NodeCustomAttribute } from "@/types/node";
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
  copyClosedRelationGroups,
  mergeRelationGroupSlices,
  pruneAfterRemovedNodeIds,
  rewriteAfterNodeMerge,
} from "@/domain/map/relationGroupLifecycle";
import {
  appendBranchLayouts,
  pruneBranchLayoutsAfterRemovedNodeIds,
  remapClosedBranchLayouts,
  rewriteBranchLayoutsAfterNodeMerge,
} from "@/domain/map/branchLayoutLifecycle";
import type { BranchLayoutDirection } from "@/types/branchLayout";
import type { MapCanvasSelection } from "@/types/mapCanvasSelection";
import type { MapRelation } from "@/types/mapRelation";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";
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
import {
  assertNodesEditable,
  lockSubtree,
  toggleNodeLock,
  unlockSubtree,
} from "@/domain/nodes/nodeEditLock";
import {
  applySetNodeLayoutPinned,
  movePinnedNodeCoordinate,
  type SetNodeLayoutPinnedResult,
} from "@/domain/nodes/nodeLayoutPinned";
import { applyNodePositionUpdates } from "@/domain/nodes/selectionLayoutShared";
import { applyManualPositionIfUnlocked } from "@/hooks/applyManualPositionIfUnlocked";
import { deleteNodeOnly as computeNodeOnlyDeletion, type DeleteNodeOnlyResult } from "@/domain/nodes/nodeOnlyDeletion";
import {
  resolveLayoutNodeForestOptions,
  resolveLayoutSpacing,
} from "@/domain/nodes/nodeMapLayoutContext";
import {
  type CreateTourOutcome,
  type TourMutationOutcome,
  type TourStepOutcome,
  useMapTourActions,
} from "@/hooks/useMapTourActions";
import { applyStateChangeWithOutcome } from "@/hooks/stateChangeOutcome";
import { applyTreeChangeWithOutcome } from "@/hooks/treeChangeOutcome";
import { insertParentNode as computeParentInsertion, type InsertParentNodeResult } from "@/domain/nodes/nodeParentInsertion";
import { replaceNodeImportance, replaceNodesImportance } from "@/domain/nodes/nodeImportanceUpdate";
import type { LabelFontSize } from "@/types/labelFontSize";
import {
  toggleNodeLabelBold as computeToggleNodeLabelBold,
  toggleNodeLabelUnderline as computeToggleNodeLabelUnderline,
  updateNodeLabelFontSize,
} from "@/domain/nodes/nodeLabelTextStyleUpdate";
import { updateNodeIcon, updateNodeKind } from "@/domain/nodes/nodeAppearanceUpdate";
import type { NodeKind } from "@/types/nodeKind";
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
import { MERGE_DEFAULT_SEPARATOR } from "@/domain/nodes/nodeSeparator";
import {
  applyAiProposals as computeAiProposalsApplication,
  summaryInputFingerprintOf,
  type AcceptedAiProposal,
  type AiProposalsApplyOutcome,
} from "@/domain/aiAssist/aiProposal";
import {
  applyAiStructureProposals as computeAiStructureProposalsApplication,
} from "@/domain/aiAssist/aiStructureProposal";
import { aiStructureInputFingerprintOf } from "@/domain/aiAssist/aiBranchInput";
import type {
  AcceptedAiStructureProposal,
  AiStructureApplyOutcome,
} from "@/domain/aiAssist/aiStructureProposal";
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
import {
  useRelationGroupActions,
  type AddGroupOutcome,
  type AddRelationOutcome,
  type RemoveGroupOutcome,
  type RemoveRelationOutcome,
  type UpdateGroupLabelOutcome,
  type UpdateRelationOutcome,
} from "@/hooks/useRelationGroupActions";
import type { Node, NodeMapLink } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { NodeMapState } from "@/types/nodeMapState";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { LayoutStyle } from "@/types/layoutStyle";
import type { TreeDirection } from "@/types/treeDirection";
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

export type {
  AddRelationOutcome,
  RemoveRelationOutcome,
  UpdateRelationOutcome,
  AddGroupOutcome,
  RemoveGroupOutcome,
  UpdateGroupLabelOutcome,
  CreateTourOutcome,
  TourMutationOutcome,
  TourStepOutcome,
};

type UseNodesReturn = {
  nodes: Node[];
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  /** キャンバス選択（ノード / 関連線 / グループ）。関連線・グループ選択時は nodes は空 */
  canvasSelection: MapCanvasSelection;
  layoutMode: NodeLayoutMode;
  treeDirection: NodeMapState["treeDirection"];
  layoutSpacing: NodeMapState["layoutSpacing"];
  layoutStyle: NodeMapState["layoutStyle"];
  branchLayouts: NodeMapState["branchLayouts"];
  relations: NodeMapState["relations"];
  groups: NodeMapState["groups"];
  tour: NodeMapState["tour"];
  addNode: (x: number, y: number) => number;
  addChildNode: (parentId: number) => number | null;
  addSiblingNode: (nodeId: number) => number | null;
  selectNode: (id: number | null) => void;
  selectRelation: (id: number) => void;
  selectGroup: (id: number) => void;
  restoreSelection: (selection: NodeSelectionState) => void;
  toggleNodeSelection: (id: number) => void;
  /** Shift範囲選択: アンカー〜target を現在の集合へ加算する（置換ではない。domain の `addRange`）。 */
  selectNodeRange: (targetId: number, visibleNodeIdsOrdered: readonly number[]) => void;
  setSelectionFromMarquee: (args: { mode: "replace" | "add"; ids: readonly number[] }) => void;
  clearSelection: () => void;
  /** 関連線／グループのキャンバス選択だけ外す（ノード選択は触らない）。アウトライン切替など */
  clearNonNodeSelection: () => void;
  pruneSelectionToVisible: (visibleNodeIds: ReadonlySet<number>) => void;
  // 既定 kind=related / directed=false。重複・locked・欠落は拒否
  addRelation: (fromId: number, toId: number) => AddRelationOutcome;
  removeRelation: (relationId: number) => RemoveRelationOutcome;
  // kind / directed 更新。重複・locked・欠落・無変更は拒否（履歴は成功時のみ）
  updateRelation: (
    relationId: number,
    patch: { kind?: MapRelation["kind"]; directed?: boolean },
  ) => UpdateRelationOutcome;
  // メンバー≥2。複数グループ所属可。locked 関与は拒否
  addGroup: (nodeIds: readonly number[], label?: string) => AddGroupOutcome;
  removeGroup: (groupId: number) => RemoveGroupOutcome;
  updateGroupLabel: (groupId: number, label: string) => UpdateGroupLabelOutcome;
  createTour: (title: string) => CreateTourOutcome;
  removeTour: () => TourMutationOutcome;
  setTourTitle: (title: string) => TourMutationOutcome;
  addTourStep: (snapshot: MapViewSnapshot, stepId?: string) => TourStepOutcome;
  removeTourStep: (stepId: string) => TourMutationOutcome;
  reorderTourStep: (fromIndex: number, toIndex: number) => TourMutationOutcome;
  overwriteTourStepSnapshot: (stepId: string, snapshot: MapViewSnapshot) => TourMutationOutcome;
  setTourStepCaption: (stepId: string, caption: string) => TourMutationOutcome;
  updateNodeLabel: (id: number, label: string) => void;
  updateNodeLabels: (replacements: ReadonlyMap<number, string>) => boolean;
  setLabelFontSize: (id: number, size: LabelFontSize) => boolean;
  toggleLabelBold: (id: number) => boolean;
  toggleLabelUnderline: (id: number) => boolean;
  setNodeIcon: (id: number, icon: string | undefined) => boolean;
  applyTask: (id: number, expected: Node["task"], next: Node["task"]) => EditOutcome;
  applyCustomAttribute: (
    id: number,
    editKey: string | null,
    original: NodeCustomAttribute | null,
    next: NodeCustomAttribute | null,
  ) => EditOutcome;
  setNodeKind: (id: number, kind: NodeKind | undefined) => boolean;
  updateNodeImportance: (id: number, importance: NodeImportance) => boolean;
  updateNodesImportance: (ids: readonly number[], importance: NodeImportance) => boolean;
  attachIllustration: (id: number, dataUrl: string) => boolean;
  removeIllustration: (id: number) => boolean;
  // 詳細メモの唯一の更新経路。履歴グループ中は履歴に積まず、グループ外では1操作として確定する。
  // 戻り値は更新を受理したか（無変更・対象不在・上限超過は false）。documentRevision は変えない
  previewNodeNote: (id: number, note: string) => boolean;
  // AI の提案の採用分を適用する（Phase 32）。最新の状態から照合し、成功なら1操作として確定する（1 回の Undo）。
  // 古い・上限超過・変化なし・拒否（関連線の選択中など）は何も変えず理由を返す。documentRevision は変えない
  applyAiProposals: (accepted: readonly AcceptedAiProposal[]) => AiProposalsApplyOutcome;
  // AI の構造提案の採用分を適用する（Phase 33）。最新の状態から照合し、成功なら1操作として確定する（1 回の Undo）。
  applyAiStructureProposals: (
    accepted: readonly AcceptedAiStructureProposal[],
    visibleNodeIds: ReadonlySet<number>,
    currentMapId: string,
  ) => AiStructureApplyOutcome;
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
  // 手動配置での座標一括確定。layoutMode が auto のときは false
  commitManualNodes: (nextNodes: Node[]) => boolean;
  // 単一ノードの編集ロックを切り替え。1操作として確定する
  toggleNodeEditLock: (nodeId: number) => boolean;
  // 部分木をロック／解除。各 1 操作として確定する
  lockNodeSubtree: (rootId: number) => boolean;
  unlockNodeSubtree: (rootId: number) => boolean;
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
  setTreeDirection: (direction: TreeDirection) => void;
  setLayoutSpacing: (spacing: LayoutSpacing) => void;
  // レイアウト様式。auto なら即リレイアウト 1 Undo。関連線／グループ選択中は拒否
  setLayoutStyle: (style: LayoutStyle) => void;
  // 位置固定の付与／解除。auto なら即リレイアウト（1 Undo）。locked は拒否
  setNodeLayoutPinned: (
    nodeId: number,
    pinned: boolean,
  ) => { ok: true } | { ok: false; reason: "locked" | "node-missing" | "invalid" | "placement-failed" };
  // 枝方向の設定／null＝文書の既定に戻す。auto+orthogonal なら即リレイアウト。locked は拒否
  setBranchLayout: (
    nodeId: number,
    direction: BranchLayoutDirection | null,
  ) => { ok: true } | { ok: false; reason: "locked" | "node-missing" | "invalid" | "placement-failed" };
  // auto+ピンの座標ドラッグ（当該ノードのみ）。子孫は追従しない
  movePinnedNode: (id: number, x: number, y: number) => boolean;
  // ピンドラッグ終了後の再配置（履歴グループ内）。成功時 true
  finalizePinnedNodeMove: () => boolean;
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
    treeDirection,
    layoutSpacing,
    layoutStyle,
    branchLayouts,
    relations,
    groups,
    tour,
    getCurrentState,
    applyNonStructuralChange: applyNonStructuralChangeRaw,
    applyNonStructuralPreview: applyNonStructuralPreviewRaw,
    applyManualMove: applyManualMoveRaw,
    applyPinnedCoordinateMove: applyPinnedCoordinateMoveRaw,
    relayoutAfterPinnedMove: relayoutAfterPinnedMoveRaw,
    applyTreeChange: applyTreeChangeRaw,
    applyStateChange: applyStateChangeRaw,
    setLayoutMode,
    setTreeDirection: setTreeDirectionRaw,
    setLayoutSpacing: setLayoutSpacingRaw,
    setLayoutStyle: setLayoutStyleRaw,
    setBranchLayout: setBranchLayoutRaw,
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
  const {
    canvasSelection,
    clearNonNodeSelection,
    isNodeOpBlocked,
    selectRelation: selectRelationOnly,
    selectGroup: selectGroupOnly,
    addRelation,
    removeRelation,
    updateRelation,
    addGroup,
    removeGroup,
    updateGroupLabel,
  } = useRelationGroupActions({
    selectedNodeIds,
    applyStateChangeRaw,
    nodeIdAllocator,
  });

  const newTourStepId = useCallback(
    () => globalThis.crypto?.randomUUID?.() ?? `tour-step-${Math.random().toString(36).slice(2)}`,
    [],
  );
  const {
    createTour: createTourRaw,
    removeTour: removeTourRaw,
    setTourTitle: setTourTitleRaw,
    addTourStep: addTourStepRaw,
    removeTourStep: removeTourStepRaw,
    reorderTourStep: reorderTourStepRaw,
    overwriteTourStepSnapshot: overwriteTourStepSnapshotRaw,
    setTourStepCaption: setTourStepCaptionRaw,
  } = useMapTourActions({
    applyStateChangeRaw: applyStateChangeRaw,
    newStepId: newTourStepId,
  });

  const createTour = createTourRaw;
  const removeTour = removeTourRaw;
  const setTourTitle = setTourTitleRaw;
  const addTourStep = addTourStepRaw;
  const removeTourStep = removeTourStepRaw;
  const reorderTourStep = reorderTourStepRaw;
  const overwriteTourStepSnapshot = overwriteTourStepSnapshotRaw;
  const setTourStepCaption = setTourStepCaptionRaw;

  // 復元したマップでは以前の選択と編集対象が無効になるため、選択を外して版を進める
  const markDocumentRestored = useCallback(() => {
    clearNonNodeSelection();
    setSelection(clearSelectionState());
    setDocumentRevision((revision) => revision + 1);
  }, [clearNonNodeSelection]);

  // §10: 関連線／グループ選択中はノード対象の確定を通さない（関係の add/remove は Raw を直接使う）
  const applyNonStructuralChange: typeof applyNonStructuralChangeRaw = useCallback((update) => {
    if (isNodeOpBlocked()) return false;
    return applyNonStructuralChangeRaw(update);
  }, [applyNonStructuralChangeRaw, isNodeOpBlocked]);

  const applyTreeChange: typeof applyTreeChangeRaw = useCallback((update) => {
    if (isNodeOpBlocked()) return false;
    return applyTreeChangeRaw(update);
  }, [applyTreeChangeRaw, isNodeOpBlocked]);

  const applyStateChange: typeof applyStateChangeRaw = useCallback((update) => {
    if (isNodeOpBlocked()) return false;
    return applyStateChangeRaw(update);
  }, [applyStateChangeRaw, isNodeOpBlocked]);

  const applyManualMove: typeof applyManualMoveRaw = useCallback((update) => {
    if (isNodeOpBlocked()) return false;
    return applyManualMoveRaw(update);
  }, [applyManualMoveRaw, isNodeOpBlocked]);

  const applyNonStructuralPreview: typeof applyNonStructuralPreviewRaw = useCallback((update) => {
    if (isNodeOpBlocked()) return false;
    return applyNonStructuralPreviewRaw(update);
  }, [applyNonStructuralPreviewRaw, isNodeOpBlocked]);

  const applyPinnedCoordinateMove: typeof applyPinnedCoordinateMoveRaw = useCallback((update) => {
    if (isNodeOpBlocked()) return false;
    return applyPinnedCoordinateMoveRaw(update);
  }, [applyPinnedCoordinateMoveRaw, isNodeOpBlocked]);

  const replaceMap = useCallback((state: NodeMapState) => {
    nodeIdAllocator.reset();
    replaceLayoutState(state);
    markDocumentRestored();
  }, [nodeIdAllocator, replaceLayoutState, markDocumentRestored]);

  // nodes ∪ relations ∪ groups の共有空間で採番する（確定時点の最新ノード列を渡す）
  const allocateEntityIds = useCallback((currentNodes: readonly Node[], count: number) => {
    const state = getCurrentState();
    return nodeIdAllocator.nextAvailableEntityIds(
      { nodes: [...currentNodes], relations: state.relations, groups: state.groups },
      count,
    );
  }, [getCurrentState, nodeIdAllocator]);

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
      id = allocateEntityIds(currentNodes, 1)[0]!;
      return [...currentNodes, createRootNode(id, x, y)];
    });
    return id;
  }, [allocateEntityIds, applyTreeChange]);

  // 基点のノード（子なら親、兄弟なら元のノード）から1つ作って追加し、作ったノードを選択してそのIDを返す。
  // 基点が無い・作れないときは何も変えずに null を返す。ID は確定時点の最新の配列から採番する
  const addNodeFromAnchor = useCallback((
    anchorId: number,
    createNode: (
      currentNodes: readonly Node[],
      anchorId: number,
      id: number,
      spacing: ReturnType<typeof resolveLayoutSpacing>,
    ) => Node | null,
  ) => {
    let createdId: number | null = null;
    const applied = applyTreeChange((currentNodes, _mode, layout) => {
      if (!assertNodesEditable([anchorId], currentNodes).ok) return null;
      const id = allocateEntityIds(currentNodes, 1)[0]!;
      const spacing = resolveLayoutSpacing(layout);
      const created = createNode(currentNodes, anchorId, id, spacing);
      if (!created) return null;

      createdId = id;
      return [...currentNodes, created];
    });
    if (!applied || createdId === null) return null;

    setSelection(selectOnly(createdId));
    return createdId;
  }, [allocateEntityIds, applyTreeChange]);

  const addChildNode = useCallback((parentId: number) => (
    addNodeFromAnchor(parentId, (nodes, parent, id, spacing) => createChildNode(nodes, parent, id, spacing))
  ), [addNodeFromAnchor]);

  const addSiblingNode = useCallback((nodeId: number) => (
    addNodeFromAnchor(
      nodeId,
      (nodes, anchor, id, spacing) => createSiblingNode(nodes, anchor, id, spacing),
    )
  ), [addNodeFromAnchor]);

  const selectNode = useCallback((id: number | null) => {
    clearNonNodeSelection();
    setSelection(id === null ? clearSelectionState() : selectOnly(id));
  }, [clearNonNodeSelection]);

  // 関連線／グループ選択時はノード選択を空にする（選択は排他）
  const selectRelation = useCallback((id: number) => {
    selectRelationOnly(id);
    setSelection(clearSelectionState());
  }, [selectRelationOnly]);

  const selectGroup = useCallback((id: number) => {
    selectGroupOnly(id);
    setSelection(clearSelectionState());
  }, [selectGroupOnly]);

  const toggleNodeSelection = useCallback((id: number) => {
    clearNonNodeSelection();
    const orderedNodeIds = getCurrentState().nodes.map((node) => node.id);
    setSelection((prev) => toggle(prev, id, orderedNodeIds));
  }, [clearNonNodeSelection, getCurrentState]);

  // 加算（置換ではない）。公開名は設計の selectNodeRange に合わせる
  const selectNodeRange = useCallback((targetId: number, visibleNodeIdsOrdered: readonly number[]) => {
    clearNonNodeSelection();
    setSelection((prev) => addRange(prev, targetId, visibleNodeIdsOrdered));
  }, [clearNonNodeSelection]);

  const setSelectionFromMarquee = useCallback((args: { mode: "replace" | "add"; ids: readonly number[] }) => {
    clearNonNodeSelection();
    setSelection((prev) => (
      args.mode === "replace" ? replaceWithMarquee(args.ids) : addMarquee(prev, args.ids)
    ));
  }, [clearNonNodeSelection]);

  const clearSelection = useCallback(() => {
    clearNonNodeSelection();
    setSelection(clearSelectionState());
  }, [clearNonNodeSelection]);

  const pruneSelectionToVisible = useCallback((visibleNodeIds: ReadonlySet<number>) => {
    const orderedNodeIds = getCurrentState().nodes.map((node) => node.id);
    setSelection((prev) => pruneMissing(prev, visibleNodeIds, orderedNodeIds));
  }, [getCurrentState]);

  const updateNodeLabel = useCallback((id: number, label: string) => {
    applyNonStructuralChange((currentNodes) => {
      if (!assertNodesEditable([id], currentNodes).ok) return null;
      return currentNodes.map((node) => (
        node.id === id ? { ...node, label } : node
      ));
    });
  }, [applyNonStructuralChange]);

  // 複数ノードのラベルを1回の更新関数でまとめて変え、1操作として履歴に記録する
  const updateNodeLabels = useCallback((replacements: ReadonlyMap<number, string>) => (
    applyNonStructuralChange((currentNodes) => replaceNodeLabels(currentNodes, replacements))
  ), [applyNonStructuralChange]);

  const setLabelFontSize = useCallback((id: number, size: LabelFontSize) => (
    applyNonStructuralChange((currentNodes) => updateNodeLabelFontSize(currentNodes, id, size))
  ), [applyNonStructuralChange]);

  const toggleLabelBold = useCallback((id: number) => (
    applyNonStructuralChange((currentNodes) => computeToggleNodeLabelBold(currentNodes, id))
  ), [applyNonStructuralChange]);

  const toggleLabelUnderline = useCallback((id: number) => (
    applyNonStructuralChange((currentNodes) => computeToggleNodeLabelUnderline(currentNodes, id))
  ), [applyNonStructuralChange]);

  const setNodeIcon = useCallback((id: number, icon: string | undefined) => (
    applyNonStructuralChange((currentNodes) => updateNodeIcon(currentNodes, id, icon))
  ), [applyNonStructuralChange]);

  const applyTask = useCallback((id: number, expected: Node["task"], next: Node["task"]): EditOutcome => {
    const normalized = normalizeTaskForEdit(next);
    if (!normalized.ok) return { ok: false, reason: "期限または担当者を確認してください。" };

    const outcome: { computation: NodeTaskUpdateComputation | null } = { computation: null };
    const applied = applyNonStructuralChange((currentNodes) => {
      outcome.computation = computeNodeTaskUpdate(currentNodes, id, expected, normalized.value);
      return outcome.computation.nodes;
    });
    return interpretTaskUpdateOutcome(applied, outcome.computation);
  }, [applyNonStructuralChange]);

  const applyCustomAttribute = useCallback((
    id: number,
    editKey: string | null,
    original: NodeCustomAttribute | null,
    next: NodeCustomAttribute | null,
  ): EditOutcome => {
    const outcome: { computation: NodeCustomAttributeUpdateComputation | null } = { computation: null };
    const applied = applyNonStructuralChange((currentNodes) => {
      outcome.computation = computeNodeCustomAttributeUpdate(currentNodes, id, editKey, original, next);
      return outcome.computation.nodes;
    });
    return interpretCustomAttributeUpdateOutcome(applied, outcome.computation);
  }, [applyNonStructuralChange]);

  const setNodeKind = useCallback((id: number, kind: NodeKind | undefined) => (
    applyNonStructuralChange((currentNodes) => updateNodeKind(currentNodes, id, kind))
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

  // 判定と確定は同じ最新の状態で行う（addNodeLink と同じ。L-453）。
  // applyNonStructuralChange の戻り値を見て、拒否されたら成功として扱わない（L-001）
  const applyAiProposals = useCallback((accepted: readonly AcceptedAiProposal[]): AiProposalsApplyOutcome => {
    const currentNodes = getCurrentState().nodes;
    const result = computeAiProposalsApplication(
      currentNodes,
      accepted,
      (rootId) => summaryInputFingerprintOf(currentNodes, rootId),
    );
    if (!result.ok) return result;
    if (!applyNonStructuralChange(() => result.nodes)) return { ok: false, reason: "rejected" };
    return { ok: true, appliedCount: result.appliedCount };
  }, [getCurrentState, applyNonStructuralChange]);

  const applyAiStructureProposals = useCallback((
    accepted: readonly AcceptedAiStructureProposal[],
    visibleNodeIds: ReadonlySet<number>,
    currentMapId: string,
  ): AiStructureApplyOutcome => {
    const current = getCurrentState();
    const result = computeAiStructureProposalsApplication({
      state: current,
      accepted,
      rebuildInputFingerprint: (rootId, kind) =>
        aiStructureInputFingerprintOf(current.nodes, rootId, kind),
      allocateNodeIds: (count) => allocateEntityIds(current.nodes, count),
      mergeJoiner: MERGE_DEFAULT_SEPARATOR,
      visibleNodeIds,
      currentMapId,
    });
    if (!result.ok) return result;
    if (!applyStateChange(() => result.state)) return { ok: false, reason: "rejected" };
    return { ok: true, appliedCount: result.appliedCount };
  }, [getCurrentState, applyStateChange, allocateEntityIds]);

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

  const commitManualNodes = useCallback((nextNodes: Node[]) => (
    applyManualPositionIfUnlocked(applyManualMove, (currentNodes) => {
      const updates = new Map<number, { x: number; y: number }>();
      for (const node of nextNodes) {
        updates.set(node.id, { x: node.x, y: node.y });
      }
      return applyNodePositionUpdates(currentNodes, updates);
    })
  ), [applyManualMove]);

  const toggleNodeEditLock = useCallback((nodeId: number) => (
    applyNonStructuralChange((currentNodes) => toggleNodeLock(currentNodes, nodeId))
  ), [applyNonStructuralChange]);

  const lockNodeSubtree = useCallback((rootId: number) => (
    applyNonStructuralChange((currentNodes) => lockSubtree(currentNodes, rootId))
  ), [applyNonStructuralChange]);

  const unlockNodeSubtree = useCallback((rootId: number) => (
    applyNonStructuralChange((currentNodes) => unlockSubtree(currentNodes, rootId))
  ), [applyNonStructuralChange]);

  const moveNode = useCallback((id: number, x: number, y: number) => {
    applyManualPositionIfUnlocked(applyManualMove, (currentNodes) => (
      moveNodeSubtree(currentNodes, id, x, y)
    ));
  }, [applyManualMove]);

  const setNodeLayoutPinned = useCallback((nodeId: number, pinned: boolean) => {
    if (isNodeOpBlocked()) return { ok: false, reason: "invalid" } as const;
    let rejectReason: Exclude<SetNodeLayoutPinnedResult, { ok: true }>["reason"] | null = null;
    const applied = applyTreeChange((currentNodes) => {
      const planned = applySetNodeLayoutPinned(currentNodes, nodeId, pinned);
      if (!planned.ok) {
        rejectReason = planned.reason;
        return null;
      }
      return planned.nodes;
    });
    if (applied) return { ok: true } as const;
    if (rejectReason === "unchanged") return { ok: true } as const;
    if (rejectReason === "locked" || rejectReason === "node-missing") {
      return { ok: false, reason: rejectReason } as const;
    }
    return { ok: false, reason: "placement-failed" } as const;
  }, [applyTreeChange, isNodeOpBlocked]);

  const setTreeDirection = useCallback((direction: TreeDirection) => {
    if (isNodeOpBlocked()) return;
    setTreeDirectionRaw(direction);
  }, [isNodeOpBlocked, setTreeDirectionRaw]);

  const setLayoutSpacing = useCallback((spacing: LayoutSpacing) => {
    if (isNodeOpBlocked()) return;
    setLayoutSpacingRaw(spacing);
  }, [isNodeOpBlocked, setLayoutSpacingRaw]);

  const setLayoutStyle = useCallback((style: LayoutStyle) => {
    if (isNodeOpBlocked()) return;
    setLayoutStyleRaw(style);
  }, [isNodeOpBlocked, setLayoutStyleRaw]);

  const setBranchLayout = useCallback((
    nodeId: number,
    direction: BranchLayoutDirection | null,
  ) => {
    if (isNodeOpBlocked()) return { ok: false, reason: "invalid" } as const;
    return setBranchLayoutRaw(nodeId, direction);
  }, [isNodeOpBlocked, setBranchLayoutRaw]);

  const movePinnedNode = useCallback((id: number, x: number, y: number) => (
    applyPinnedCoordinateMove((currentNodes) => movePinnedNodeCoordinate(currentNodes, id, x, y))
  ), [applyPinnedCoordinateMove]);

  const finalizePinnedNodeMove = useCallback(() => {
    if (isNodeOpBlocked()) return false;
    return relayoutAfterPinnedMoveRaw();
  }, [isNodeOpBlocked, relayoutAfterPinnedMoveRaw]);

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
      spacing: ReturnType<typeof resolveLayoutSpacing>,
      layoutOptions: ReturnType<typeof resolveLayoutNodeForestOptions>,
    ) => SubtreeInsertionResult | null,
  ) => {
    let insertedRootId: number | null = null;
    const applied = applyTreeChange((currentNodes, mode, layout) => {
      const spacing = resolveLayoutSpacing(layout);
      const layoutOptions = resolveLayoutNodeForestOptions(layout);
      const inserted = insert(
        currentNodes,
        mode,
        (occupied, count) => allocateEntityIds(occupied, count),
        spacing,
        layoutOptions,
      );
      if (!inserted) return null;

      insertedRootId = inserted.rootId;
      return inserted.nodes;
    });
    if (!applied || insertedRootId === null) return null;

    setSelection(selectOnly(insertedRootId));
    return insertedRootId;
  }, [allocateEntityIds, applyTreeChange]);

  // 閉じた relation/group も新 entity ID で写す（pasteSubtree と同型）
  const duplicateSubtree = useCallback((sourceId: number) => {
    let insertedRootId: number | null = null;
    const applied = applyStateChange((current, layout) => {
      const spacing = resolveLayoutSpacing(layout);
      const inserted = duplicateNodeSubtree(
        current.nodes,
        sourceId,
        current.layoutMode,
        (occupied, count) => nodeIdAllocator.nextAvailableEntityIds(
          { nodes: [...occupied], relations: current.relations, groups: current.groups },
          count,
        ),
        spacing,
      );
      if (!inserted) return null;
      insertedRootId = inserted.rootId;

      const remapped = copyClosedRelationGroups(
        current.relations,
        current.groups,
        inserted.nodeIdMapping,
        { nodes: [...inserted.nodes], relations: current.relations, groups: current.groups },
        (state, count) => nodeIdAllocator.nextAvailableEntityIds(state, count),
      );
      const merged = mergeRelationGroupSlices(current, remapped);
      const remappedBranchLayouts = remapClosedBranchLayouts(
        current.branchLayouts,
        inserted.nodeIdMapping,
      );
      return {
        ...current,
        nodes: inserted.nodes,
        relations: merged.relations,
        groups: merged.groups,
        branchLayouts: appendBranchLayouts(current.branchLayouts, remappedBranchLayouts),
      };
    });
    if (!applied || insertedRootId === null) return null;
    setSelection(selectOnly(insertedRootId));
    return insertedRootId;
  }, [applyStateChange, nodeIdAllocator]);

  const copySubtree = useCallback((sourceId: number) => {
    if (isNodeOpBlocked()) return { ok: false, reason: "invalid" } as const;
    const state = getCurrentState();
    return encodeSubtreeClipboard(state.nodes, sourceId, {
      relations: state.relations,
      groups: state.groups,
      branchLayouts: state.branchLayouts,
    });
  }, [getCurrentState, isNodeOpBlocked]);

  const restoreSelection = useCallback((next: NodeSelectionState) => {
    clearNonNodeSelection();
    setSelection(next);
  }, [clearNonNodeSelection]);

  const pasteSubtree = useCallback((data: SubtreeClipboardData) => {
    let insertedRootId: number | null = null;
    const applied = applyStateChange((current, layout) => {
      const spacing = resolveLayoutSpacing(layout);
      const inserted = insertNodeSubtree(
        current.nodes,
        data.nodes,
        data.rootId,
        null,
        current.layoutMode,
        (occupied, count) => nodeIdAllocator.nextAvailableEntityIds(
          { nodes: [...occupied], relations: current.relations, groups: current.groups },
          count,
        ),
        "paste",
        spacing,
      );
      if (!inserted) return null;
      insertedRootId = inserted.rootId;

      const remapped = copyClosedRelationGroups(
        data.relations,
        data.groups,
        inserted.nodeIdMapping,
        { nodes: [...inserted.nodes], relations: current.relations, groups: current.groups },
        (state, count) => nodeIdAllocator.nextAvailableEntityIds(state, count),
      );
      const merged = mergeRelationGroupSlices(current, remapped);
      const remappedBranchLayouts = remapClosedBranchLayouts(
        data.branchLayouts,
        inserted.nodeIdMapping,
      );
      return {
        ...current,
        nodes: inserted.nodes,
        relations: merged.relations,
        groups: merged.groups,
        branchLayouts: appendBranchLayouts(current.branchLayouts, remappedBranchLayouts),
      };
    });
    if (!applied || insertedRootId === null) return null;
    setSelection(selectOnly(insertedRootId));
    return insertedRootId;
  }, [applyStateChange, nodeIdAllocator]);

  // 部品挿入など、任意の部分木を targetParentId（null なら新ルート）へ挿入する
  const insertSubtree = useCallback((
    sources: readonly Node[],
    sourceRootId: number,
    targetParentId: number | null,
  ) => (
    applySubtreeInsertion((currentNodes, mode, allocateIds, spacing) => (
      insertNodeSubtree(
        currentNodes,
        sources,
        sourceRootId,
        targetParentId,
        mode,
        allocateIds,
        "paste",
        spacing,
      )
    ))
  ), [applySubtreeInsertion]);

  const insertForest = useCallback((
    items: readonly ForestItem[],
    target: ForestInsertionTarget,
  ): InsertForestResult => {
    let failureReason: ForestInsertionFailureReason | null = null;
    const rootId = applySubtreeInsertion((currentNodes, mode, allocateIds, spacing, layoutOptions) => {
      const inserted = insertNodeForest(
        currentNodes,
        items,
        target,
        mode,
        allocateIds,
        spacing,
        layoutOptions,
      );
      if (!inserted.ok) {
        failureReason = inserted.reason;
        return null;
      }
      return {
        nodes: inserted.nodes,
        rootId: inserted.rootIds[0]!,
        nodeIdMapping: new Map(),
      };
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
    applyTreeChangeWithOutcome<ReorderSiblingResult>(applyTreeChange, (currentNodes, mode, _layout) => {
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
    applyTreeChangeWithOutcome<ChangeNodeIndentResult>(applyTreeChange, (currentNodes, mode, layout) => {
      const changed = computeNodeIndent(
        currentNodes,
        nodeId,
        direction,
        visibleNodeIds,
        mode,
        resolveLayoutSpacing(layout),
      );
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
    const settled = applyTreeChangeWithOutcome<InsertParentNodeResult>(applyTreeChange, (currentNodes, mode, layout) => {
      const id = allocateEntityIds(currentNodes, 1)[0]!;
      const inserted = computeParentInsertion(
        currentNodes,
        nodeId,
        id,
        visibleNodeIds,
        mode,
        resolveLayoutSpacing(layout),
      );
      if (!inserted.ok) return { nodes: null, outcome: inserted };
      const { nodes, ...summary } = inserted;
      return { nodes, outcome: summary };
    });
    if (settled.ok) setSelection(selectOnly(settled.insertedId));
    return settled;
  }, [allocateEntityIds, applyTreeChange]);

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

      const newNodeIds = allocateEntityIds(currentNodes, fresh.fragments.length - 1);
      const split = computeNodeSplit(currentNodes, nodeId, separator, newNodeIds, visibleNodeIds);
      if (!split.ok) return { nodes: null, outcome: split };
      return { nodes: split.nodes, outcome: { ok: true, insertedIds: split.insertedIds } };
    })
  ), [allocateEntityIds, applyTreeChange]);

  // 統合は成功したら、残したノードだけを選択する。選択に残った吸収されるノードの ID は、ここで置き換わる
  const mergeNodes = useCallback((
    ids: readonly number[],
    primaryId: number | null,
    joiner: string,
    visibleNodeIds: ReadonlySet<number>,
    expected: NodeMergePlan,
    currentMapId: string,
  ): MergeNodesResult => {
    const settled = applyStateChangeWithOutcome<MergeNodesResult>(applyStateChange, (current) => {
      const fresh = planNodeMerge(current.nodes, ids, primaryId, joiner, visibleNodeIds, currentMapId);
      if (!fresh.ok) return { state: null, outcome: fresh };
      if (!isSameNodeMergePlan(fresh, expected)) {
        return { state: null, outcome: { ok: false, reason: "plan-changed" } };
      }

      const merged = computeNodeMerge(
        current.nodes,
        ids,
        primaryId,
        joiner,
        visibleNodeIds,
        current.layoutMode,
        currentMapId,
      );
      if (!merged.ok) return { state: null, outcome: merged };
      const rewritten = rewriteAfterNodeMerge(
        merged.survivorId,
        merged.absorbedIds,
        current.relations,
        current.groups,
      );
      const rewrittenBranchLayouts = rewriteBranchLayoutsAfterNodeMerge(
        merged.survivorId,
        merged.absorbedIds,
        current.branchLayouts,
      );
      return {
        state: {
          ...current,
          nodes: merged.nodes,
          relations: rewritten.relations,
          groups: rewritten.groups,
          branchLayouts: rewrittenBranchLayouts,
        },
        outcome: { ok: true, survivorId: merged.survivorId, absorbedCount: merged.absorbedIds.length },
      };
    });
    if (settled.ok) setSelection(selectOnly(settled.survivorId));
    return settled;
  }, [applyStateChange]);

  const moveBranch = useCallback((rootId: number, parentId: number | null): MoveBranchResult => {
    const settled = applyTreeChangeWithOutcome<MoveBranchResult>(applyTreeChange, (currentNodes, mode, layout) => {
      const spacing = resolveLayoutSpacing(layout);
      const layoutOptions = resolveLayoutNodeForestOptions(layout);
      const moved = moveNodeBranch(currentNodes, rootId, parentId, mode, spacing, layoutOptions);
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
    const settled = applyStateChangeWithOutcome<DeleteNodeOnlyResult>(applyStateChange, (current) => {
      const deleted = computeNodeOnlyDeletion(
        current.nodes,
        nodeId,
        visibleNodeIds,
        current.layoutMode,
      );
      if (!deleted.ok) return { state: null, outcome: deleted };
      const pruned = pruneAfterRemovedNodeIds(current.relations, current.groups, [deleted.deletedId]);
      const prunedBranchLayouts = pruneBranchLayoutsAfterRemovedNodeIds(
        current.branchLayouts,
        [deleted.deletedId],
      );
      return {
        state: {
          ...current,
          nodes: deleted.nodes,
          relations: pruned.relations,
          groups: pruned.groups,
          branchLayouts: prunedBranchLayouts,
        },
        outcome: { ok: true, deletedId: deleted.deletedId },
      };
    });
    if (settled.ok) {
      const remaining = getCurrentState().nodes;
      const remainingIds = new Set(remaining.map((node) => node.id));
      const orderedNodeIds = remaining.map((node) => node.id);
      setSelection((prev) => pruneMissing(prev, remainingIds, orderedNodeIds));
    }
    return settled;
  }, [applyStateChange, getCurrentState]);

  const deleteNode = useCallback((id: number) => {
    const applied = applyStateChange((current) => {
      const subtreeIds = collectSubtreeIds(current.nodes, id);
      if (!assertNodesEditable([...subtreeIds], current.nodes).ok) return null;
      const nextNodes = current.nodes.filter((node) => !subtreeIds.has(node.id));
      const pruned = pruneAfterRemovedNodeIds(current.relations, current.groups, [...subtreeIds]);
      const prunedBranchLayouts = pruneBranchLayoutsAfterRemovedNodeIds(
        current.branchLayouts,
        [...subtreeIds],
      );
      return {
        ...current,
        nodes: nextNodes,
        relations: pruned.relations,
        groups: pruned.groups,
        branchLayouts: prunedBranchLayouts,
      };
    });
    if (!applied) return;

    const remaining = getCurrentState().nodes;
    const remainingIds = new Set(remaining.map((node) => node.id));
    const orderedNodeIds = remaining.map((node) => node.id);
    setSelection((prev) => pruneMissing(prev, remainingIds, orderedNodeIds));
  }, [applyStateChange, getCurrentState]);

  return {
    nodes,
    selectedNodeId,
    selectedNodeIds,
    canvasSelection,
    layoutMode,
    treeDirection,
    layoutSpacing,
    layoutStyle,
    branchLayouts,
    relations,
    groups,
    tour,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    selectRelation,
    selectGroup,
    restoreSelection,
    toggleNodeSelection,
    selectNodeRange,
    setSelectionFromMarquee,
    clearSelection,
    clearNonNodeSelection,
    pruneSelectionToVisible,
    addRelation,
    removeRelation,
    updateRelation,
    addGroup,
    removeGroup,
    updateGroupLabel,
    createTour,
    removeTour,
    setTourTitle,
    addTourStep,
    removeTourStep,
    reorderTourStep,
    overwriteTourStepSnapshot,
    setTourStepCaption,
    updateNodeLabel,
    updateNodeLabels,
    setLabelFontSize,
    toggleLabelBold,
    toggleLabelUnderline,
    setNodeIcon,
    applyTask,
    applyCustomAttribute,
    setNodeKind,
    updateNodeImportance,
    updateNodesImportance,
    attachIllustration,
    removeIllustration,
    previewNodeNote,
    applyAiProposals,
    applyAiStructureProposals,
    addNodeLink,
    removeNodeLink,
    addNodeTag,
    removeNodeTag,
    addNodeSource,
    removeNodeSource,
    addNodeMapLink,
    removeNodeMapLink,
    commitManualNodes,
    toggleNodeEditLock,
    lockNodeSubtree,
    unlockNodeSubtree,
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
    setTreeDirection,
    setLayoutSpacing,
    setLayoutStyle,
    setNodeLayoutPinned,
    setBranchLayout,
    movePinnedNode,
    finalizePinnedNodeMove,
    replaceMap,
    documentRevision,
    canUndo,
    canRedo,
    undo,
    redo,
    beginMoveHistory,
  };
}
