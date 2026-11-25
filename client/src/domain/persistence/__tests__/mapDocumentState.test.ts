import {
  mapDocumentOptionsForNewMap,
  mapDocumentOptionsFromState,
  nodeMapStateFromDocument,
  omitTourFromMapDocument,
} from "@/domain/persistence/mapDocumentState";
import { serializeMapDocument } from "@/domain/persistence/mapDocumentCodec";
import type { MapDocumentV3 } from "@/types/mapDocument";
import { createTestNode } from "@/testing/createTestNode";

const snapshot = {
  viewport: { offsetX: 0, offsetY: 0, scale: 1 },
  selectedNodeId: null,
  selectedNodeIds: [] as number[],
  focusRootId: null,
  collapsedNodeIds: [] as number[],
  resolutionMode: "all" as const,
  autoResolutionLevel: "all" as const,
};

describe("mapDocumentState tour 投影", () => {
  const document: MapDocumentV3 = {
    version: 3,
    layoutMode: "manual",
    nodes: [createTestNode({ id: 1, parentId: null })],
    tour: {
      version: 1,
      title: "投影",
      steps: [{ id: "s1", snapshot, caption: "c" }],
    },
  };

  it("document↔state で tour が落ちない", () => {
    const state = nodeMapStateFromDocument(document);
    expect(state.tour).toEqual(document.tour);
    expect(mapDocumentOptionsFromState(state)).toEqual({ tour: document.tour });
  });

  it("新規マップ用 projection は tour を含めない", () => {
    const state = nodeMapStateFromDocument(document);
    expect(mapDocumentOptionsForNewMap(state)).not.toHaveProperty("tour");
  });

  it("omitTourFromMapDocument はシリアライズ JSON から tour を除く", () => {
    const stripped = omitTourFromMapDocument(document);
    expect(stripped.tour).toBeUndefined();
    expect(serializeMapDocument(stripped)).not.toContain("tour");
  });
});