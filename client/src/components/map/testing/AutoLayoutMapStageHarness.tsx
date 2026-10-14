import { useEffect, useRef } from "react";
import { MapStage } from "@/components/map/MapStage";
import { useNodes } from "@/hooks/useNodes";

export function AutoLayoutMapStageHarness() {
  const {
    nodes,
    selectedNodeId,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    updateNodeLabel,
    moveNode,
    beginMoveHistory,
    connectNodes,
    deleteNode,
    copySubtree,
    pasteSubtree,
    setLayoutMode,
    documentRevision,
  } = useNodes();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const firstRootId = addNode(100, 100);
    addNode(500, 300);
    selectNode(firstRootId);
    setLayoutMode("auto");
  }, [addNode, selectNode, setLayoutMode]);

  return (
    <>
      <MapStage
        nodes={nodes}
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
        onClipboardNotice={() => {}}
        documentRevision={documentRevision}
      />
      <output data-testid="node-state">{JSON.stringify(nodes)}</output>
      <output data-testid="selected-node-id">{selectedNodeId}</output>
    </>
  );
}
