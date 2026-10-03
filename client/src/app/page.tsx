"use client";

import { useState } from "react";
import { useNodes } from "@/hooks/useNodes";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppWorkspace } from "@/components/layout/AppWorkspace";
import { NodeImportanceSelector } from "@/components/layout/NodeImportanceSelector";
import { ResolutionFilterSelector } from "@/components/layout/ResolutionFilterSelector";
import { MapImageExportControls } from "@/components/layout/MapImageExportControls";
import { MapPersistenceControls } from "@/components/layout/MapPersistenceControls";
import { MapOperationNotice } from "@/components/layout/MapOperationNotice";
import { IllustrationPanel } from "@/components/layout/IllustrationPanel";
import { MapStage } from "@/components/map/MapStage";
import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";
import { useIllustrationGeneration } from "@/hooks/useIllustrationGeneration";
import { useMapImageExport } from "@/hooks/useMapImageExport";
import { useMapPersistence } from "@/hooks/useMapPersistence";
import { useResettingMapReplacement } from "@/hooks/useResettingMapReplacement";
import { useMapResolutionFilter } from "@/hooks/useMapResolutionFilter";

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
    deleteNode,
    setLayoutMode,
    replaceMap,
    attachIllustration,
    removeIllustration,
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
  const { generation, generateIllustration, dismissGeneration } = useIllustrationGeneration(nodes, resetRevision);

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
        operationNotices={persistence.notice === null && imageExport.notice === null
          ? null
          : (
            <>
              {persistence.notice !== null && (
                <MapOperationNotice notice={persistence.notice} />
              )}
              {imageExport.notice !== null && (
                <MapOperationNotice notice={imageExport.notice} />
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
            onConnectNodes={connectNodes}
            onDeleteNode={deleteNode}
            onGenerateIllustration={generateIllustration}
            resetRevision={resetRevision}
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
