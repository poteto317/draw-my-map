"use client";

import { useNodes } from "@/hooks/useNodes";
import { AppHeader } from "@/components/layout/AppHeader";
import { MapStage } from "@/components/map/MapStage";

export default function Home() {
  const {
    nodes,
    selectedNodeId,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    updateNodeLabel,
    moveNode,
    deleteNode,
  } = useNodes();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-900">
      <AppHeader />
      <main className="flex-1">
        <MapStage
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          onDoubleClick={addNode}
          onAddChildNode={addChildNode}
          onAddSiblingNode={addSiblingNode}
          onSelectNode={selectNode}
          onUpdateLabel={updateNodeLabel}
          onMoveNode={moveNode}
          onDeleteNode={deleteNode}
        />
      </main>
    </div>
  );
}
