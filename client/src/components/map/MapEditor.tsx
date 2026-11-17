"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { EditorViewModeControl, type EditorViewMode } from "@/components/layout/EditorViewModeControl";
import { OutlineEditor } from "@/components/outline/OutlineEditor";
import { summarizeSelectionImportance } from "@/domain/nodes/selectionImportanceSummary";
import { buildOutlineRows } from "@/domain/outline/outlineRows";
import { useOutlineEditorActions } from "@/hooks/useOutlineEditorActions";
import { useOutlineCanvasReturn } from "@/hooks/useOutlineCanvasReturn";
import { useRevisionScopedNodeRequest } from "@/hooks/useRevisionScopedNodeRequest";
import { BranchMoveControl } from "@/components/layout/BranchMoveControl";
import { BranchMoveDialog } from "@/components/layout/BranchMoveDialog";
import { LabelReplaceControl } from "@/components/layout/LabelReplaceControl";
import { LabelReplaceDialog } from "@/components/layout/LabelReplaceDialog";
import { NodeMergeControl } from "@/components/layout/NodeMergeControl";
import { NodeMergeDialog } from "@/components/layout/NodeMergeDialog";
import { NodeSplitControl } from "@/components/layout/NodeSplitControl";
import { NodeSplitDialog } from "@/components/layout/NodeSplitDialog";
import type { BranchMoveMapTarget } from "@/hooks/branchMoveDialogState";
import { useBranchMoveDialog } from "@/hooks/useBranchMoveDialog";
import { useHeaderFocusReturn } from "@/hooks/useHeaderFocusReturn";
import { useLabelReplaceDialog } from "@/hooks/useLabelReplaceDialog";
import { useNodeMergeDialog } from "@/hooks/useNodeMergeDialog";
import { useNodeSplitDialog } from "@/hooks/useNodeSplitDialog";
import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";
import { useNodes } from "@/hooks/useNodes";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppWorkspace } from "@/components/layout/AppWorkspace";
import { NodeImportanceSelector } from "@/components/layout/NodeImportanceSelector";
import { ResolutionFilterSelector } from "@/components/layout/ResolutionFilterSelector";
import { MapImageExportControls } from "@/components/layout/MapImageExportControls";
import { OutlineExportControls } from "@/components/layout/OutlineExportControls";
import { MapHistoryControls } from "@/components/layout/MapHistoryControls";
import { NodeCollapseControl } from "@/components/layout/NodeCollapseControl";
import { NodeDuplicateControl } from "@/components/layout/NodeDuplicateControl";
import { NodeIndentControl } from "@/components/layout/NodeIndentControl";
import { NodeOnlyDeleteControl } from "@/components/layout/NodeOnlyDeleteControl";
import { NodeParentInsertControl } from "@/components/layout/NodeParentInsertControl";
import { NodeSiblingOrderControl } from "@/components/layout/NodeSiblingOrderControl";
import { MapPersistenceControls } from "@/components/layout/MapPersistenceControls";
import {
  hasOperationNotice,
  MapOperationNoticeList,
} from "@/components/layout/MapOperationNoticeList";
import { MapConflictNotice } from "@/components/layout/MapConflictNotice";
import { MapConflictConfirmDialog } from "@/components/layout/MapConflictConfirmDialog";
import { OutlineImportControl } from "@/components/layout/OutlineImportControl";
import { OutlineImportDialog } from "@/components/layout/OutlineImportDialog";
import { resolveOutlineParentCandidate } from "@/components/layout/outlineParentCandidate";
import { NodeSearchBox } from "@/components/layout/NodeSearchBox";
import { NodeDetailPanel } from "@/components/layout/NodeDetailPanel";
import { MapStage } from "@/components/map/MapStage";
import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";
import { useIllustrationGeneration } from "@/hooks/useIllustrationGeneration";
import { useMapHistoryShortcuts } from "@/components/map/useMapHistoryShortcuts";
import { useMapImageExport } from "@/hooks/useMapImageExport";
import { useOutlineExport } from "@/hooks/useOutlineExport";
import { useMapPersistence } from "@/hooks/useMapPersistence";
import { useNodeDuplicationAction } from "@/hooks/useNodeDuplicationAction";
import { useResettingMapReplacement } from "@/hooks/useResettingMapReplacement";
import { useMapResolutionFilter } from "@/hooks/useMapResolutionFilter";
import { useRevisionScopedNotice } from "@/hooks/useRevisionScopedNotice";
import { useNodeLabelSearch } from "@/hooks/useNodeLabelSearch";
import { useMapDisplayState } from "@/hooks/useMapDisplayState";
import { useBranchCollapse } from "@/hooks/useBranchCollapse";
import { useNodeSearchNavigation } from "@/hooks/useNodeSearchNavigation";
import { useOutlineImport } from "@/hooks/useOutlineImport";
import { useSiblingReorderAction } from "@/hooks/useSiblingReorderAction";
import { useNodeIndentAction } from "@/hooks/useNodeIndentAction";
import { useNodeOnlyDeletionAction } from "@/hooks/useNodeOnlyDeletionAction";
import { useNodeParentInsertionAction } from "@/hooks/useNodeParentInsertionAction";
import type { MapStorageSession } from "@/types/mapStorageSession";
import type { OperationNotice } from "@/types/operationNotice";

const CLIPBOARD_OPERATION_HINT = "枝をコピー: Ctrl/Cmd+C ／ 貼り付け: Ctrl/Cmd+V（新しいルートとして追加）";
const LAYOUT_FAILED_NOTICE: OperationNotice = {
  kind: "status",
  message: "表示用の自動配置ができないため、元の位置で表示しています。",
};

type MapEditorProps = {
  mapId: string;
  mapName: string;
  storageSession: MapStorageSession;
  storageMode: "persistent" | "protected";
  mapControls: ReactNode;
  // シェルが保護モードへ移ったときのフォーカスの戻し先。ボタンはこの編集画面が描画する
  exportButtonRef: RefObject<HTMLButtonElement | null>;
  mapMoveTargets: readonly BranchMoveMapTarget[];
  onMoveBranchToMap: (rootId: number, targetMapId: string) => MapLibraryOperationResult;
  onSaveCurrentAsNewMap?: (name: string, snapshotJson: string) => MapLibraryOperationResult;
  shortcutsEnabled: boolean;
  // 画面の外のダイアログで最後にマウスでクリックした時刻。ダイアログが1回目のクリックで閉じると、
  // ダブルクリックの2回目と dblclick が MapStage のキャンバスへ届くので、メニューの項目と同じ時間窓で無視する
  dialogMouseClickedAtRef: RefObject<number | null>;
};

// 1つのマップの編集画面。マップを切り替えるときは親が key を変えて再マウントし、履歴と表示状態を破棄する。
// shortcutsEnabled が false の間（ダイアログ表示中）は、根を inert にしてショートカットも止める。
// 箇条書きの取り込みのダイアログを開いている間も同じように止め、ダイアログは根の兄弟に描いて inert の外に置く
export function MapEditor({
  mapId,
  mapName,
  storageSession,
  storageMode,
  mapControls,
  exportButtonRef,
  mapMoveTargets,
  onMoveBranchToMap,
  onSaveCurrentAsNewMap,
  shortcutsEnabled,
  dialogMouseClickedAtRef,
}: MapEditorProps) {
  const {
    nodes,
    selectedNodeId,
    selectedNodeIds,
    layoutMode,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    toggleNodeSelection,
    selectNodeRange,
    setSelectionFromMarquee,
    clearSelection,
    pruneSelectionToVisible,
    updateNodeLabel,
    updateNodesImportance,
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
    updateNodeLabels,
    splitNode,
    mergeNodes,
    deleteNode,
    deleteNodeOnly,
    setLayoutMode,
    replaceMap,
    attachIllustration,
    removeIllustration,
    previewNodeNote,
    beginMoveHistory,
    documentRevision,
    canUndo,
    canRedo,
    undo,
    redo,
  } = useNodes();
  const [viewMode, setViewMode] = useState<EditorViewMode>("map");
  const canvasFocus = useRevisionScopedNodeRequest(documentRevision);
  const [viewportScale, setViewportScale] = useState(1);
  const { replaceMapAndReset, resetRevision } = useResettingMapReplacement(replaceMap);
  const resolutionFilter = useMapResolutionFilter({
    nodes,
    scale: viewportScale,
    resetRevision,
    resetScale: INITIAL_VIEWPORT.scale,
  });
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  // 一括編集の対象。アウトラインは単一選択のため、キャンバスで残った複数選択を見えないまま変えない
  const importanceTargetIds = useMemo<readonly number[]>(() => {
    if (viewMode === "map") return selectedNodeIds;
    return selectedNodeId === null ? [] : [selectedNodeId];
  }, [viewMode, selectedNodeIds, selectedNodeId]);
  const importanceSummary = summarizeSelectionImportance(nodes, importanceTargetIds);
  const branchCollapse = useBranchCollapse({ nodes, documentRevision });
  const { expandNodes } = branchCollapse;
  const expandNodesRef = useRef(expandNodes);
  useLayoutEffect(() => {
    expandNodesRef.current = expandNodes;
  }, [expandNodes]);
  const addChildNodeExpanding = useCallback((parentId: number) => {
    const createdId = addChildNode(parentId);
    if (createdId !== null) expandNodesRef.current([parentId]);
    return createdId;
  }, [addChildNode]);
  const displayState = useMapDisplayState({
    nodes,
    layoutMode,
    collapseVisibleNodeIds: branchCollapse.collapseVisibleNodeIds,
    resolutionVisibleNodeIds: resolutionFilter.visibleNodeIds,
  });
  const nodeSearch = useNodeLabelSearch({
    nodes,
    visibleNodeIds: displayState.visibleNodeIds,
  });
  const nodeSearchNavigation = useNodeSearchNavigation({
    issueFocusRequest: canvasFocus.issueRequest,
    nodes,
    resolutionVisibleNodeIds: resolutionFilter.visibleNodeIds,
    collapseIndex: branchCollapse.index,
    collapsedNodeIds: branchCollapse.collapsedNodeIds,
    expandNodes: branchCollapse.expandNodes,
    documentRevision,
    setResolutionMode: resolutionFilter.setMode,
    selectNode,
  });
  const persistence = useMapPersistence({
    nodes,
    layoutMode,
    replaceMap: replaceMapAndReset,
    storageSession,
    storageMode,
    mapName,
    onSaveCurrentAsNewMap,
  });
  const imageExport = useMapImageExport({
    nodes,
    mapName,
  });
  const { generation, generateIllustration, dismissGeneration } = useIllustrationGeneration(nodes, documentRevision);
  const duplication = useNodeDuplicationAction({
    selectedNodeId: selectedNode?.id ?? null,
    documentRevision,
    duplicateSubtree,
  });
  const {
    notice: clipboardNotice,
    publishNotice: publishClipboardNotice,
  } = useRevisionScopedNotice(documentRevision);
  // 枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ・親の挿入・ノードだけ削除）。9系統目
  const {
    notice: treeEditNotice,
    publishNotice: publishTreeEditNotice,
    clearNotice: clearTreeEditNotice,
  } = useRevisionScopedNotice(documentRevision);
  const outlineImport = useOutlineImport({
    selectedNodeId,
    documentRevision,
    insertForest,
    expandNodes: branchCollapse.expandNodes,
  });
  const siblingReorder = useSiblingReorderAction({
    selectedNodeId,
    nodes,
    visibleNodeIds: displayState.visibleNodeIds,
    reorderSibling,
    publishNotice: publishTreeEditNotice,
  });
  const nodeIndent = useNodeIndentAction({
    selectedNodeId,
    nodes,
    visibleNodeIds: displayState.visibleNodeIds,
    changeNodeIndent,
    expandNodes: branchCollapse.expandNodes,
    publishNotice: publishTreeEditNotice,
  });
  const nodeParentInsertion = useNodeParentInsertionAction({
    selectedNodeId,
    nodes,
    visibleNodeIds: displayState.visibleNodeIds,
    documentRevision,
    insertParentNode,
    publishNotice: publishTreeEditNotice,
    clearNotice: clearTreeEditNotice,
  });
  const nodeOnlyDeletion = useNodeOnlyDeletionAction({
    selectedNodeId,
    nodes,
    visibleNodeIds: displayState.visibleNodeIds,
    deleteNodeOnly,
    publishNotice: publishTreeEditNotice,
  });
  const branchMove = useBranchMoveDialog({
    mapId,
    mapMoveTargets,
    nodes,
    selectedNodeId,
    documentRevision,
    moveBranch,
    onMoveBranchToMap,
    expandNodes: branchCollapse.expandNodes,
    resolutionVisibleNodeIds: resolutionFilter.visibleNodeIds,
    setResolutionMode: resolutionFilter.setMode,
    publishNotice: publishTreeEditNotice,
  });
  const branchMoveButtonRef = useRef<HTMLButtonElement>(null);
  const { focusRequest: branchMoveFocusRequest, consumeFocusRequest: consumeBranchMoveFocusRequest } = branchMove;
  useLayoutEffect(() => {
    if (branchMoveFocusRequest !== "header") return;
    // 開いている間の置換で選択が外れるとボタンは無効になるので、常に押せる「JSON書き出し」へ送る
    const button = branchMoveButtonRef.current;
    (button?.disabled ? exportButtonRef.current : button)?.focus();
    consumeBranchMoveFocusRequest();
  }, [branchMoveFocusRequest, consumeBranchMoveFocusRequest, exportButtonRef]);
  const labelReplace = useLabelReplaceDialog({
    mapId,
    nodes,
    selectedNodeIds,
    documentRevision,
    updateNodeLabels,
    publishNotice: publishTreeEditNotice,
  });
  const labelReplaceButtonRef = useRef<HTMLButtonElement>(null);
  const { focusRequest: labelReplaceFocusRequest, consumeFocusRequest: consumeLabelReplaceFocusRequest } = labelReplace;
  useLayoutEffect(() => {
    if (labelReplaceFocusRequest !== "header") return;
    // ノードが無くなるとボタンは無効になるので、常に押せる「JSON書き出し」へ送る
    const button = labelReplaceButtonRef.current;
    (button?.disabled ? exportButtonRef.current : button)?.focus();
    consumeLabelReplaceFocusRequest();
  }, [labelReplaceFocusRequest, consumeLabelReplaceFocusRequest, exportButtonRef]);
  const nodeSplit = useNodeSplitDialog({
    mapId,
    nodes,
    selectedNodeId,
    visibleNodeIds: displayState.visibleNodeIds,
    documentRevision,
    splitNode,
    publishNotice: publishTreeEditNotice,
  });
  const nodeSplitButtonRef = useRef<HTMLButtonElement>(null);
  // 確定でボタンが無効になったときは、常に押せる「JSON書き出し」へ送る
  const splitFocusFallbacks = useMemo(() => [exportButtonRef], [exportButtonRef]);
  useHeaderFocusReturn({
    focusRequest: nodeSplit.focusRequest,
    consumeFocusRequest: nodeSplit.consumeFocusRequest,
    buttonRef: nodeSplitButtonRef,
    fallbackRefs: splitFocusFallbacks,
  });
  const nodeMerge = useNodeMergeDialog({
    mapId,
    nodes,
    selectedNodeId,
    selectedNodeIds,
    visibleNodeIds: displayState.visibleNodeIds,
    documentRevision,
    mergeNodes,
    publishNotice: publishTreeEditNotice,
  });
  const nodeMergeButtonRef = useRef<HTMLButtonElement>(null);
  // 成功すると選択が 1 件（残したノード）になり、ボタンが無効になる。「JSON書き出し」へ送ると、続けて押した Enter で
  // ダウンロードが始まってしまうので、押しても無害な「ノードを分割」へ送る（無効なら「JSON書き出し」）
  const mergeFocusFallbacks = useMemo(() => [nodeSplitButtonRef, exportButtonRef], [exportButtonRef]);
  useHeaderFocusReturn({
    focusRequest: nodeMerge.focusRequest,
    consumeFocusRequest: nodeMerge.consumeFocusRequest,
    buttonRef: nodeMergeButtonRef,
    fallbackRefs: mergeFocusFallbacks,
  });
  const { moveSelected: moveSelectedSibling } = siblingReorder;
  const moveSelectedSiblingUp = useCallback(() => moveSelectedSibling("up"), [moveSelectedSibling]);
  const moveSelectedSiblingDown = useCallback(() => moveSelectedSibling("down"), [moveSelectedSibling]);
  const { changeSelected: changeSelectedIndent } = nodeIndent;
  const outdentSelected = useCallback(() => changeSelectedIndent("outdent"), [changeSelectedIndent]);
  const indentSelected = useCallback(() => changeSelectedIndent("indent"), [changeSelectedIndent]);
  // 下の effect の依存配列に入れるため、値と関数を取り出しておく
  const { focusRequest: outlineFocusRequest, consumeFocusRequest: consumeOutlineFocusRequest } = outlineImport;
  const outlineImportButtonRef = useRef<HTMLButtonElement>(null);
  // 入口をすべて同じ値で止める（L-061）
  const editorShortcutsEnabled = shortcutsEnabled
    && outlineImport.screen === "closed"
    && branchMove.screen === "closed"
    && labelReplace.screen === "closed"
    && nodeSplit.screen === "closed"
    && nodeMerge.screen === "closed"
    && !persistence.isConfirmOpen;
  useMapHistoryShortcuts({ undo, redo, enabled: editorShortcutsEnabled });
  const outlineModel = useMemo(() => buildOutlineRows(nodes), [nodes]);
  const outlineExport = useOutlineExport({ model: outlineModel, mapName });
  const outlineActions = useOutlineEditorActions({
    nodes, selectedNodeId, documentRevision,
    enabled: editorShortcutsEnabled && viewMode === "outline",
    model: outlineModel,
    api: { selectNode, updateNodeLabel, insertForest, addChildNode, addSiblingNode, reorderSibling, changeNodeIndent, deleteNodeOnly },
    expandNodes: branchCollapse.expandNodes,
    publishNotice: publishTreeEditNotice,
  });
  const { returnToCanvas } = useOutlineCanvasReturn({
    nodes, selectedNodeId, documentRevision,
    collapseIndex: branchCollapse.index, collapsedNodeIds: branchCollapse.collapsedNodeIds,
    resolutionMode: resolutionFilter.mode, expandNodes: branchCollapse.expandNodes,
    setResolutionMode: resolutionFilter.setMode, publishNotice: publishTreeEditNotice,
    issueFocusRequest: canvasFocus.issueRequest,
  });
  function changeViewMode(nextMode: EditorViewMode) {
    if (!editorShortcutsEnabled || nextMode === viewMode) return;
    canvasFocus.clearRequest();
    if (nextMode === "map") {
      setViewportScale(INITIAL_VIEWPORT.scale);
      resolutionFilter.resetViewportScale(INITIAL_VIEWPORT.scale);
      returnToCanvas();
    }
    setViewMode(nextMode);
  }

  // 操作通知バーの並び（上から表示する順）。位置ごとに系統が決まっている
  const operationNotices = [
    displayState.layoutFailed ? LAYOUT_FAILED_NOTICE : null,
    persistence.notice,
    imageExport.notice,
    outlineExport.notice,
    duplication.notice,
    clipboardNotice,
    nodeSearchNavigation.notice,
    outlineImport.notice,
    treeEditNotice,
    persistence.conflictActionNotice,
  ];

  // 閉じる描画で根の inert が外れた後に当てる（L-155）。"input"・"preview" はダイアログが当てる
  useLayoutEffect(() => {
    if (outlineFocusRequest !== "header") return;
    outlineImportButtonRef.current?.focus();
    consumeOutlineFocusRequest();
  }, [outlineFocusRequest, consumeOutlineFocusRequest]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col" data-map-id={mapId} inert={!editorShortcutsEnabled}>
        <AppHeader
          layoutMode={layoutMode}
          onLayoutModeChange={setLayoutMode}
          mapControls={mapControls}
          saveStatus={persistence.saveStatus}
          viewControls={<EditorViewModeControl mode={viewMode} onChange={changeViewMode} />}
          showCanvasHints={viewMode === "map"}
          searchControls={viewMode === "map" && (
            <NodeSearchBox
              query={nodeSearch.query}
              onQueryChange={nodeSearch.setQuery}
              hasQuery={nodeSearch.hasQuery}
              matches={nodeSearch.matches}
              total={nodeSearch.total}
              onSelectResult={nodeSearchNavigation.navigateToNode}
            />
          )}
          importanceControls={(
            <NodeImportanceSelector
              importance={importanceSummary.kind === "uniform" ? importanceSummary.importance : null}
              disabled={importanceSummary.kind === "none"}
              selectionCount={importanceSummary.kind === "none" ? 0 : importanceSummary.count}
              mixed={importanceSummary.kind === "mixed"}
              onChange={(importance) => {
                updateNodesImportance(importanceTargetIds, importance);
              }}
            />
          )}
          resolutionControls={viewMode === "map" && (
            <ResolutionFilterSelector
              mode={resolutionFilter.mode}
              level={resolutionFilter.level}
              onChange={resolutionFilter.setMode}
            />
          )}
          operationControls={(
            <>
              <MapHistoryControls
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undo}
                onRedo={redo}
              />
              {viewMode === "map" && (
                <>
                  <NodeCollapseControl
                    selectedNodeId={selectedNodeId}
                    canToggle={selectedNodeId !== null && branchCollapse.canToggle(selectedNodeId)}
                    collapsed={selectedNodeId !== null && branchCollapse.collapsedNodeIds.has(selectedNodeId)}
                    hiddenCount={selectedNodeId === null ? 0 : branchCollapse.hiddenCountById.get(selectedNodeId) ?? 0}
                    onToggle={branchCollapse.toggle}
                  />
                  <NodeDuplicateControl
                    disabled={selectedNode === null}
                    onDuplicate={duplication.duplicateSelected}
                  />
                  <BranchMoveControl
                    expanded={branchMove.screen !== "closed"}
                    disabled={selectedNode === null}
                    onOpen={branchMove.open}
                    buttonRef={branchMoveButtonRef}
                  />
                  <LabelReplaceControl
                    expanded={labelReplace.screen !== "closed"}
                    disabled={nodes.length === 0}
                    onOpen={labelReplace.open}
                    buttonRef={labelReplaceButtonRef}
                  />
                  <NodeSplitControl
                    expanded={nodeSplit.screen !== "closed"}
                    disabled={!nodeSplit.canOpen}
                    disabledReason={nodeSplit.disabledReason}
                    onOpen={nodeSplit.open}
                    buttonRef={nodeSplitButtonRef}
                  />
                  <NodeMergeControl
                    expanded={nodeMerge.screen !== "closed"}
                    disabled={!nodeMerge.canOpen}
                    disabledReason={nodeMerge.disabledReason}
                    onOpen={nodeMerge.open}
                    buttonRef={nodeMergeButtonRef}
                  />
                  <NodeSiblingOrderControl
                    canMoveUp={siblingReorder.canMoveUp}
                    canMoveDown={siblingReorder.canMoveDown}
                    onMoveUp={moveSelectedSiblingUp}
                    onMoveDown={moveSelectedSiblingDown}
                  />
                  <NodeIndentControl
                    canOutdent={nodeIndent.canOutdent}
                    canIndent={nodeIndent.canIndent}
                    onOutdent={outdentSelected}
                    onIndent={indentSelected}
                  />
                  <NodeParentInsertControl
                    canInsert={nodeParentInsertion.canInsert}
                    onInsert={nodeParentInsertion.insertSelected}
                  />
                  <NodeOnlyDeleteControl
                    canDelete={nodeOnlyDeletion.canDelete}
                    onDelete={nodeOnlyDeletion.deleteSelected}
                  />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {CLIPBOARD_OPERATION_HINT}
                  </span>
                </>
              )}
              <OutlineImportControl
                expanded={outlineImport.screen !== "closed"}
                onOpen={outlineImport.open}
                buttonRef={outlineImportButtonRef}
              />
              <MapPersistenceControls
                onExport={persistence.exportJson}
                onImport={persistence.importJsonFile}
                exportButtonRef={exportButtonRef}
              />
              <MapImageExportControls
                onExportPng={imageExport.exportPng}
                onExportSvg={imageExport.exportSvg}
                isExportingPng={imageExport.isExportingPng}
              />
              <OutlineExportControls
                onExportMarkdown={outlineExport.exportMarkdown}
                onExportPlainText={outlineExport.exportPlainText}
              />
            </>
          )}
          operationNotices={hasOperationNotice(operationNotices)
            ? <MapOperationNoticeList notices={operationNotices} />
            : null}
        />
        <MapConflictNotice
          conflictState={persistence.conflictState}
          onSaveAsCopy={persistence.handleSaveAsCopy}
          onReloadExternal={persistence.handleReloadExternal}
          onExportJson={persistence.exportJson}
        />
        <AppWorkspace
          canvas={viewMode === "outline" ? (
            <OutlineEditor nodes={nodes} model={outlineModel} selectedNodeId={selectedNodeId}
              documentRevision={documentRevision} enabled={editorShortcutsEnabled} actions={outlineActions} />
          ) : (
            <MapStage
              nodes={displayState.displayNodes}
              focusRequest={canvasFocus.request}
              visibleNodeIds={displayState.visibleNodeIds}
              onViewportScaleChange={setViewportScale}
              selectedNodeId={selectedNodeId}
              selectedNodeIds={selectedNodeIds}
              onDoubleClick={addNode}
              onAddChildNode={addChildNodeExpanding}
              onAddSiblingNode={addSiblingNode}
              onSelectNode={selectNode}
              onToggleNodeSelection={toggleNodeSelection}
              onSelectNodeRange={selectNodeRange}
              onSetSelectionFromMarquee={setSelectionFromMarquee}
              onClearSelection={clearSelection}
              pruneSelectionToVisible={pruneSelectionToVisible}
              onUpdateLabel={updateNodeLabel}
              onMoveNode={moveNode}
              onBeginNodeMove={beginMoveHistory}
              onConnectNodes={connectNodes}
              layoutMode={layoutMode}
              onReorderSibling={siblingReorder.reorder}
              onChangeNodeIndent={nodeIndent.change}
              onInsertParentNode={nodeParentInsertion.insert}
              labelEditRequest={nodeParentInsertion.labelEditRequest}
              onDeleteNode={deleteNode}
              onCopySubtree={copySubtree}
              onPasteSubtree={pasteSubtree}
              onClipboardNotice={publishClipboardNotice}
              onGenerateIllustration={generateIllustration}
              resetRevision={resetRevision}
              documentRevision={documentRevision}
              shortcutsEnabled={editorShortcutsEnabled}
              dialogMouseClickedAtRef={dialogMouseClickedAtRef}
            />
          )}
          sidePanel={(
            <NodeDetailPanel
              selectedNode={selectedNode}
              // アウトライン表示では主選択だけ（キャンバスで残った複数選択の件数を見せない）
              selectionCount={importanceTargetIds.length}
              documentRevision={documentRevision}
              onPreviewNote={previewNodeNote}
              onBeginNoteEdit={beginMoveHistory}
              generation={generation}
              onGenerate={generateIllustration}
              onAttach={(nodeId, dataUrl) => {
                if (attachIllustration(nodeId, dataUrl)) dismissGeneration();
              }}
              onRemove={removeIllustration}
            />
          )}
        />
      </div>
      {branchMove.screen === "open" && (
        <BranchMoveDialog
          mapMoveTargets={mapMoveTargets}
          targetMapId={branchMove.targetMapId}
          currentMapId={mapId}
          sameMap={branchMove.sameMap}
          parentCandidates={branchMove.parentCandidates}
          nodes={nodes}
          allowRoot={branchMove.allowRoot}
          parentTarget={branchMove.parentTarget}
          canSubmit={branchMove.canSubmit}
          error={branchMove.error}
          focusRequest={branchMove.focusRequest}
          onFocusRequestApplied={branchMove.consumeFocusRequest}
          onTargetMapChange={branchMove.setTargetMapId}
          onParentTargetChange={branchMove.setParentTarget}
          onCancel={branchMove.close}
          onSubmit={branchMove.submit}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      {labelReplace.screen === "open" && (
        <LabelReplaceDialog
          query={labelReplace.query}
          replacement={labelReplace.replacement}
          scopeSelectedOnly={labelReplace.scopeSelectedOnly}
          scopeCount={labelReplace.scopeCount}
          previewRows={labelReplace.previewRows}
          hiddenReplaceCount={labelReplace.hiddenReplaceCount}
          previewLimit={labelReplace.previewLimit}
          statusText={labelReplace.statusText}
          submitLabel={labelReplace.submitLabel}
          error={labelReplace.error}
          canSubmit={labelReplace.canSubmit}
          focusRequest={labelReplace.focusRequest}
          onFocusRequestApplied={labelReplace.consumeFocusRequest}
          onQueryChange={labelReplace.setQuery}
          onReplacementChange={labelReplace.setReplacement}
          onScopeSelectedOnlyChange={labelReplace.setScopeSelectedOnly}
          onCancel={labelReplace.close}
          onSubmit={labelReplace.submit}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      {nodeSplit.screen === "open" && (
        <NodeSplitDialog
          targetLabel={nodeSplit.targetLabel}
          separatorPreset={nodeSplit.separatorPreset}
          customSeparator={nodeSplit.customSeparator}
          fragments={nodeSplit.fragments}
          statusText={nodeSplit.statusText}
          error={nodeSplit.error}
          canSubmit={nodeSplit.canSubmit}
          focusRequest={nodeSplit.focusRequest}
          onFocusRequestApplied={nodeSplit.consumeFocusRequest}
          onSeparatorPresetChange={nodeSplit.setSeparatorPreset}
          onCustomSeparatorChange={nodeSplit.setCustomSeparator}
          onCancel={nodeSplit.close}
          onSubmit={nodeSplit.submit}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      {nodeMerge.screen === "open" && (
        <NodeMergeDialog
          preview={nodeMerge.preview}
          separatorPreset={nodeMerge.separatorPreset}
          customSeparator={nodeMerge.customSeparator}
          statusText={nodeMerge.statusText}
          error={nodeMerge.error}
          canSubmit={nodeMerge.canSubmit}
          focusRequest={nodeMerge.focusRequest}
          onFocusRequestApplied={nodeMerge.consumeFocusRequest}
          onSeparatorPresetChange={nodeMerge.setSeparatorPreset}
          onCustomSeparatorChange={nodeMerge.setCustomSeparator}
          onCancel={nodeMerge.close}
          onSubmit={nodeMerge.submit}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      {/* data-map-id を付けず、根の inert の外に置く */}
      {outlineImport.screen !== "closed" && (
        <OutlineImportDialog
          screen={outlineImport.screen}
          text={outlineImport.text}
          textLength={outlineImport.textLength}
          inputError={outlineImport.inputError}
          outline={outlineImport.outline}
          preview={outlineImport.preview}
          parentCandidate={resolveOutlineParentCandidate(
            nodes,
            outlineImport.parentCandidateId,
            outlineImport.parentCandidateStale,
          )}
          target={outlineImport.target}
          dialogNotices={outlineImport.dialogNotices}
          focusRequest={outlineImport.focusRequest}
          onFocusRequestApplied={outlineImport.consumeFocusRequest}
          onTextChange={outlineImport.setText}
          onPreview={outlineImport.requestPreview}
          onCancel={outlineImport.close}
          onBack={outlineImport.back}
          onTargetChange={outlineImport.setTarget}
          onSubmit={outlineImport.submit}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
      {persistence.isConfirmOpen && (
        <MapConflictConfirmDialog
          isOpen={persistence.isConfirmOpen}
          onConfirm={persistence.handleConfirmReload}
          onCancel={persistence.handleCancelConfirm}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
    </>
  );
}
