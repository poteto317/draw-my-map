"use client";

import { useNodes } from "@/hooks/useNodes";
import { AppHeader } from "@/components/layout/AppHeader";
import { MapStage } from "@/components/map/MapStage";

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
  } = useNodes();

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 dark:bg-zinc-900">
      <AppHeader
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
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
        />
      </main>
    </div>
  );
}
