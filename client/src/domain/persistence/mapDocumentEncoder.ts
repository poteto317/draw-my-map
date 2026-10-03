import { projectMapDocumentNode } from "@/domain/persistence/mapDocumentNodeProjection";
import type { MapDocument, MapDocumentV3 } from "@/types/mapDocument";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

function projectMapDocument(
  nodes: readonly Node[],
  layoutMode: NodeLayoutMode,
): MapDocumentV3 {
  return {
    version: 3,
    layoutMode,
    nodes: nodes.map(projectMapDocumentNode),
  };
}

export function createMapDocument(
  nodes: readonly Node[],
  layoutMode: NodeLayoutMode,
): MapDocumentV3 {
  return projectMapDocument(nodes, layoutMode);
}

export function serializeMapDocument(document: MapDocument): string {
  return `${JSON.stringify(
    projectMapDocument(document.nodes, document.layoutMode),
    null,
    2,
  )}\n`;
}
