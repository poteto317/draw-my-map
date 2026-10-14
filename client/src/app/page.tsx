"use client";

import { useState } from "react";
import { useNodes } from "@/hooks/useNodes";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppWorkspace } from "@/components/layout/AppWorkspace";
import { NodeImportanceSelector } from "@/components/layout/NodeImportanceSelector";
import { ResolutionFilterSelector } from "@/components/layout/ResolutionFilterSelector";
import { MapImageExportControls } from "@/components/layout/MapImageExportControls";
import { MapHistoryControls } from "@/components/layout/MapHistoryControls";
import { NodeDuplicateControl } from "@/components/layout/NodeDuplicateControl";
import { MapPersistenceControls } from "@/components/layout/MapPersistenceControls";
import { MapOperationNotice } from "@/components/layout/MapOperationNotice";
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

const CLIPBOARD_OPERATION_HINT = "枝をコピー: Ctrl/Cmd+C ／ 貼り付け: Ctrl/Cmd+V（新しいルートとして追加）";

export default function Home() {
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
  const persistence = useMapPersistence({
    nodes,
    layoutMode,
    replaceMap: replaceMapAndReset,
  });
  const imageExport = useMapImageExport({ nodes });
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
  useMapHistoryShortcuts({ undo, redo });

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 dark:bg-zinc-900">
      <AppHeader
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
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
            <NodeDuplicateControl
              disabled={selectedNode === null}
              onDuplicate={duplication.duplicateSelected}
            />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {CLIPBOARD_OPERATION_HINT}
            </span>
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
          ? null
          : (
            <>
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
            </>
          )}
      />
      <AppWorkspace
        canvas={(
          <MapStage
            nodes={nodes}
            visibleNodeIds={resolutionFilter.visibleNodeIds}
            onViewportScaleChange={setViewportScale}
            selectedNodeId={selectedNodeId}
            onDoubleClick={addNode}
            onAddChildNode={addChildNode}
            onAddSiblingNode={addSiblingNode}
            onSelectNode={selectNode}
            onUpdateLabel={updateNodeLabel}
            onMoveNode={moveNode}
            onBeginNodeMove={beginMoveHistory}
            onConnectNodes={connectNodes}
            onDeleteNode={deleteNode}
            onCopySubtree={copySubtree}
            onPasteSubtree={pasteSubtree}
            onClipboardNotice={publishClipboardNotice}
            onGenerateIllustration={generateIllustration}
            resetRevision={resetRevision}
            documentRevision={documentRevision}
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
  );
}
