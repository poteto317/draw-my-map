import { extractStoredBranch } from "../mapBranchExtract";
import { createMapDocument, serializeMapDocument, parseMapDocumentJson } from "@/domain/persistence/mapDocumentCodec";
import { createRecordingStorage, seedMapLibrary } from "@/testing/mapLibraryTestStorage";
import { createTestNode } from "@/testing/createTestNode";
import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";
import { EXTRACT_BRANCH_DISPLAY_FALLBACK } from "@/domain/nodes/extractBranchToMap";
import { encodeMapIndex } from "@/domain/mapLibrary/mapIndex";
import { mapBodyKey, MAP_INDEX_STORAGE_KEY } from "../mapLibraryStorage";
import { BRANCH_MOVE_JOURNAL_KEY } from "../branchMoveJournal";

const now = new Date("2026-11-23T00:00:00.000Z");
const source = serializeMapDocument(createMapDocument([
  createTestNode({ id: 1, parentId: null, label: "旅行の計画", x: 0, y: 0 }),
  createTestNode({ id: 2, parentId: 1, label: "枝", x: 120, y: 40 }),
  createTestNode({ id: 3, parentId: 2, label: "子" }),
], "manual"));

function setup() {
  const recording = createRecordingStorage();
  const index = seedMapLibrary(recording.storage, [{ id: "a", json: source, name: "旅行の計画" }]);
  recording.operations.length = 0;
  return { ...recording, index };
}

describe("extractStoredBranch", () => {
  it("新マップ作成・枝移動・スタブ・新マップを開く", () => {
    const { storage, index } = setup();
    const result = extractStoredBranch(storage, index, "a", "new-map", 2, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.index.currentMapId).toBe("new-map");
    expect(result.index.maps.find((m) => m.id === "new-map")?.name).toBe(`旅行の計画 — 枝`);
    const sourceDoc = parseMapDocumentJson(storage.getItem(mapBodyKey("a"))!);
    const targetDoc = parseMapDocumentJson(storage.getItem(mapBodyKey("new-map"))!);
    expect(targetDoc.ok && targetDoc.value.nodes.map((n) => n.label)).toEqual(["枝", "子"]);
    expect(sourceDoc.ok && sourceDoc.value.nodes.map((n) => n.label)).toEqual(["旅行の計画", "枝"]);
    const stub = sourceDoc.ok && sourceDoc.value.nodes.find((n) => n.id === result.stubNodeId);
    expect(stub).toMatchObject({
      parentId: 1,
      x: 120,
      y: 40,
      label: "枝",
      mapLinks: [{ targetMapId: "new-map" }],
    });
    expect(storage.getItem(BRANCH_MOVE_JOURNAL_KEY)).toBeNull();
  });

  it("元マップに learn があっても切り出し先 JSON には含めない", () => {
    const withLearn = serializeMapDocument(createMapDocument([
      createTestNode({ id: 1, parentId: null, label: "旅行の計画", x: 0, y: 0 }),
      createTestNode({ id: 2, parentId: 1, label: "枝", x: 120, y: 40 }),
    ], "manual", {
      learn: {
        version: 1,
        revealedNodeIds: [1],
        cards: [{ id: "c1", prompt: "p", answer: "a", sourceNodeIds: [1] }],
      },
    }));
    const recording = createRecordingStorage();
    const index = seedMapLibrary(recording.storage, [{ id: "a", json: withLearn, name: "旅行の計画" }]);

    const result = extractStoredBranch(recording.storage, index, "a", "new-map", 2, now);
    expect(result.ok).toBe(true);
    const sourceDoc = parseMapDocumentJson(recording.storage.getItem(mapBodyKey("a"))!);
    const targetDoc = parseMapDocumentJson(recording.storage.getItem(mapBodyKey("new-map"))!);
    expect(sourceDoc.ok && sourceDoc.value.learn?.revealedNodeIds).toEqual([1]);
    expect(targetDoc.ok && "learn" in targetDoc.value).toBe(false);
  });

  it("元マップに tour があっても切り出し先 JSON には含めない", () => {
    const snap = {
      viewport: { offsetX: 0, offsetY: 0, scale: 1 },
      selectedNodeId: 2,
      selectedNodeIds: [2],
      focusRootId: null,
      collapsedNodeIds: [],
      resolutionMode: "all" as const,
      autoResolutionLevel: "all" as const,
    };
    const withTour = serializeMapDocument(createMapDocument([
      createTestNode({ id: 1, parentId: null, label: "旅行の計画", x: 0, y: 0 }),
      createTestNode({ id: 2, parentId: 1, label: "枝", x: 120, y: 40 }),
    ], "manual", {
      tour: { version: 1, title: "案内", steps: [{ id: "s1", snapshot: snap }] },
    }));
    const recording = createRecordingStorage();
    const index = seedMapLibrary(recording.storage, [{ id: "a", json: withTour, name: "旅行の計画" }]);

    const result = extractStoredBranch(recording.storage, index, "a", "new-map", 2, now);
    expect(result.ok).toBe(true);
    const sourceDoc = parseMapDocumentJson(recording.storage.getItem(mapBodyKey("a"))!);
    const targetDoc = parseMapDocumentJson(recording.storage.getItem(mapBodyKey("new-map"))!);
    expect(sourceDoc.ok && sourceDoc.value.tour?.title).toBe("案内");
    expect(targetDoc.ok && "tour" in targetDoc.value).toBe(false);
  });

  it("閉じた relations/groups を新マップへ保存し、元は prune する", () => {
    const withClosed = serializeMapDocument(createMapDocument([
      createTestNode({ id: 1, parentId: null, label: "旅行の計画", x: 0, y: 0 }),
      createTestNode({ id: 2, parentId: 1, label: "枝", x: 120, y: 40 }),
      createTestNode({ id: 3, parentId: 2, label: "子" }),
    ], "manual", {
      relations: [
        { id: 10, fromId: 2, toId: 3, kind: "related", directed: false },
        { id: 11, fromId: 1, toId: 2, kind: "related", directed: false },
      ],
      groups: [
        { id: 20, nodeIds: [2, 3], label: "closed" },
        { id: 21, nodeIds: [1, 2, 3], label: "split" },
      ],
    }));
    const recording = createRecordingStorage();
    const index = seedMapLibrary(recording.storage, [{ id: "a", json: withClosed, name: "旅行の計画" }]);

    const result = extractStoredBranch(recording.storage, index, "a", "new-map", 2, now);
    expect(result.ok).toBe(true);
    const sourceDoc = parseMapDocumentJson(recording.storage.getItem(mapBodyKey("a"))!);
    const targetDoc = parseMapDocumentJson(recording.storage.getItem(mapBodyKey("new-map"))!);
    expect(sourceDoc.ok).toBe(true);
    expect(targetDoc.ok).toBe(true);
    if (!sourceDoc.ok || !targetDoc.ok) return;
    expect(sourceDoc.value.relations).toBeUndefined();
    expect(sourceDoc.value.groups).toBeUndefined();
    expect(targetDoc.value.relations).toHaveLength(1);
    expect(targetDoc.value.groups).toEqual([
      expect.objectContaining({
        nodeIds: [targetDoc.value.nodes[0]!.id, targetDoc.value.nodes[1]!.id],
        label: "closed",
      }),
    ]);
  });

  it("空白ラベルはマップ名とスタブラベルを既定値にする", () => {
    const blankSource = serializeMapDocument(createMapDocument([
      createTestNode({ id: 1, parentId: null, label: "元" }),
      createTestNode({ id: 2, parentId: 1, label: "   " }),
    ], "manual"));
    const recording = createRecordingStorage();
    const index = seedMapLibrary(recording.storage, [{ id: "a", json: blankSource, name: "元" }]);
    const result = extractStoredBranch(recording.storage, index, "a", "new-map", 2, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.index.maps.find((m) => m.id === "new-map")?.name).toBe(`元 — ${EXTRACT_BRANCH_DISPLAY_FALLBACK}`);
    const sourceDoc = parseMapDocumentJson(recording.storage.getItem(mapBodyKey("a"))!);
    expect(sourceDoc.ok).toBe(true);
    if (!sourceDoc.ok) return;
    const stub = sourceDoc.value.nodes.find((n) => n.id === result.stubNodeId);
    expect(stub?.label).toBe(FALLBACK_NODE_LABEL);
  });

  it("ルート切り出しは拒否し保存を変えない", () => {
    const { storage, index, entries } = setup();
    const before = entries();
    const result = extractStoredBranch(storage, index, "a", "new-map", 1, now);
    expect(result.ok).toBe(false);
    expect(entries()).toEqual(before);
  });

  it("書き込み失敗時はロールバックする", () => {
    const index = seedMapLibrary(createRecordingStorage().storage, [{ id: "a", json: source, name: "旅行の計画" }]);
    const { storage, entries } = createRecordingStorage({
      initial: { [mapBodyKey("a")]: source, [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index) },
      failSetItem: (key) => key === mapBodyKey("new-map"),
    });
    const before = entries();
    expect(extractStoredBranch(storage, index, "a", "new-map", 2, now).ok).toBe(false);
    expect(entries()).toEqual(before);
  });
});