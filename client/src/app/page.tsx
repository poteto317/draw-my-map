"use client";

import { useNodes } from "@/hooks/useNodes";
import { AppHeader } from "@/components/layout/AppHeader";
import { MapPersistenceControls } from "@/components/layout/MapPersistenceControls";
import { MapOperationNotice } from "@/components/layout/MapOperationNotice";
import { MapStage } from "@/components/map/MapStage";
import { useMapPersistence } from "@/hooks/useMapPersistence";
import { useResettingMapReplacement } from "@/hooks/useResettingMapReplacement";

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
    moveNode,
    connectNodes,
    deleteNode,
    setLayoutMode,
    replaceMap,
  } = useNodes();
  const { replaceMapAndReset, resetRevision } = useResettingMapReplacement(replaceMap);
  const persistence = useMapPersistence({
    nodes,
    layoutMode,
    replaceMap: replaceMapAndReset,
  });

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 dark:bg-zinc-900">
      <AppHeader
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        operationControls={(
          <MapPersistenceControls
            onExport={persistence.exportJson}
            onImport={persistence.importJsonFile}
          />
        )}
        operationNotices={persistence.notice === null
          ? null
          : <MapOperationNotice notice={persistence.notice} />}
      />
      <main className="min-h-0 flex-1 overflow-hidden">
        <MapStage
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          onDoubleClick={addNode}
          onAddChildNode={addChildNode}
          onAddSiblingNode={addSiblingNode}
          onSelectNode={selectNode}
          onUpdateLabel={updateNodeLabel}
          onMoveNode={moveNode}
          onConnectNodes={connectNodes}
          onDeleteNode={deleteNode}
          resetRevision={resetRevision}
        />
      </main>
    </div>
  );
}
