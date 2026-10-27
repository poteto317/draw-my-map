"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useNodes } from "@/hooks/useNodes";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppWorkspace } from "@/components/layout/AppWorkspace";
import { NodeImportanceSelector } from "@/components/layout/NodeImportanceSelector";
import { ResolutionFilterSelector } from "@/components/layout/ResolutionFilterSelector";
import { MapImageExportControls } from "@/components/layout/MapImageExportControls";
import { MapHistoryControls } from "@/components/layout/MapHistoryControls";
import { NodeCollapseControl } from "@/components/layout/NodeCollapseControl";
import { NodeDuplicateControl } from "@/components/layout/NodeDuplicateControl";
import { NodeIndentControl } from "@/components/layout/NodeIndentControl";
import { NodeParentInsertControl } from "@/components/layout/NodeParentInsertControl";
import { NodeSiblingOrderControl } from "@/components/layout/NodeSiblingOrderControl";
import { MapPersistenceControls } from "@/components/layout/MapPersistenceControls";
import { MapOperationNotice } from "@/components/layout/MapOperationNotice";
import { OutlineImportControl } from "@/components/layout/OutlineImportControl";
import { OutlineImportDialog } from "@/components/layout/OutlineImportDialog";
import { resolveOutlineParentCandidate } from "@/components/layout/outlineParentCandidate";
import { NodeSearchBox } from "@/components/layout/NodeSearchBox";
import { IllustrationPanel } from "@/components/layout/IllustrationPanel";
import { MapStage } from "@/components/map/MapStage";
import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";
import { useIllustrationGeneration } from "@/hooks/useIllustrationGeneration";
import { useMapHistoryShortcuts } from "@/components/map/useMapHistoryShortcuts";
import { useMapImageExport } from "@/hooks/useMapImageExport";
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
import { useNodeParentInsertionAction } from "@/hooks/useNodeParentInsertionAction";
import type { MapStorageSession } from "@/types/mapStorageSession";

const CLIPBOARD_OPERATION_HINT = "枝をコピー: Ctrl/Cmd+C ／ 貼り付け: Ctrl/Cmd+V（新しいルートとして追加）";

type MapEditorProps = {
  mapId: string;
  mapName: string;
  storageSession: MapStorageSession;
  mapControls: ReactNode;
  shortcutsEnabled: boolean;
  // シェルのダイアログで最後にマウスでクリックした時刻。MapStage がその直後の dblclick を無視する
  dialogMouseClickedAtRef: RefObject<number | null>;
};

// 1つのマップの編集画面。マップを切り替えるときは親が key を変えて再マウントし、履歴と表示状態を破棄する。
// shortcutsEnabled が false の間（ダイアログ表示中）は、根を inert にしてショートカットも止める。
// 箇条書きの取り込みのダイアログを開いている間も同じように止め、ダイアログは根の兄弟に描いて inert の外に置く
export function MapEditor({
  mapId,
  mapName,
  storageSession,
  mapControls,
  shortcutsEnabled,
  dialogMouseClickedAtRef,
}: MapEditorProps) {
  const {
    nodes,
    selectedNodeId,
    layoutMode,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    updateNodeLabel,
    updateNodeImportance,
    moveNode,
    connectNodes,
    duplicateSubtree,
    copySubtree,
    pasteSubtree,
    insertForest,
    reorderSibling,
    changeNodeIndent,
    insertParentNode,
    deleteNode,
    setLayoutMode,
    replaceMap,
    attachIllustration,
    removeIllustration,
    beginMoveHistory,
    documentRevision,
    canUndo,
    canRedo,
    undo,
    redo,
  } = useNodes();
  const [viewportScale, setViewportScale] = useState(1);
  const { replaceMapAndReset, resetRevision } = useResettingMapReplacement(replaceMap);
  const resolutionFilter = useMapResolutionFilter({
    nodes,
    scale: viewportScale,
    resetRevision,
    resetScale: INITIAL_VIEWPORT.scale,
  });
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
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
    mapName,
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
  // 枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ・親の挿入）。8系統目
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
  const editorShortcutsEnabled = shortcutsEnabled && outlineImport.screen === "closed";
  useMapHistoryShortcuts({ undo, redo, enabled: editorShortcutsEnabled });

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
          searchControls={(
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
              importance={selectedNode?.importance ?? null}
              disabled={selectedNode === null}
              onChange={(importance) => {
                if (selectedNode !== null) updateNodeImportance(selectedNode.id, importance);
              }}
            />
          )}
          resolutionControls={(
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
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {CLIPBOARD_OPERATION_HINT}
              </span>
              <OutlineImportControl
                expanded={outlineImport.screen !== "closed"}
                onOpen={outlineImport.open}
                buttonRef={outlineImportButtonRef}
              />
              <MapPersistenceControls
                onExport={persistence.exportJson}
                onImport={persistence.importJsonFile}
              />
              <MapImageExportControls
                onExportPng={imageExport.exportPng}
                onExportSvg={imageExport.exportSvg}
                isExportingPng={imageExport.isExportingPng}
              />
            </>
          )}
          operationNotices={persistence.notice === null
            && imageExport.notice === null
            && duplication.notice === null
            && clipboardNotice === null
            && nodeSearchNavigation.notice === null
            && outlineImport.notice === null
            && treeEditNotice === null
            && !displayState.layoutFailed
            ? null
            : (
              <>
                {displayState.layoutFailed && (
                  <MapOperationNotice notice={{
                    kind: "status",
                    message: "表示用の自動配置ができないため、元の位置で表示しています。",
                  }} />
                )}
                {persistence.notice !== null && (
                  <MapOperationNotice notice={persistence.notice} />
                )}
                {imageExport.notice !== null && (
                  <MapOperationNotice notice={imageExport.notice} />
                )}
                {duplication.notice !== null && (
                  <MapOperationNotice notice={duplication.notice} />
                )}
                {clipboardNotice !== null && (
                  <MapOperationNotice notice={clipboardNotice} />
                )}
                {nodeSearchNavigation.notice !== null && (
                  <MapOperationNotice notice={nodeSearchNavigation.notice} />
                )}
                {outlineImport.notice !== null && (
                  <MapOperationNotice notice={outlineImport.notice} />
                )}
                {treeEditNotice !== null && (
                  <MapOperationNotice notice={treeEditNotice} />
                )}
              </>
            )}
        />
        <AppWorkspace
          canvas={(
            <MapStage
              nodes={displayState.displayNodes}
              focusRequest={nodeSearchNavigation.focusRequest}
              visibleNodeIds={displayState.visibleNodeIds}
              onViewportScaleChange={setViewportScale}
              selectedNodeId={selectedNodeId}
              onDoubleClick={addNode}
              onAddChildNode={addChildNodeExpanding}
              onAddSiblingNode={addSiblingNode}
              onSelectNode={selectNode}
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
            <IllustrationPanel
              selectedNode={selectedNode}
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
    </>
  );
}
