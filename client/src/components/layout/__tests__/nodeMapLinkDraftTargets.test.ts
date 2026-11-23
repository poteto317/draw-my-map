import { resolveNodeMapLinkDraftTargets } from "@/components/layout/nodeMapLinkDraftTargets";
import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import { createTestNode } from "@/testing/createTestNode";

function mapEntry(id: string): MapIndexEntry {
  return {
    id,
    name: `マップ ${id}`,
    createdAt: "2026-11-19T00:00:00.000Z",
    updatedAt: "2026-11-19T00:00:00.000Z",
  };
}

const maps = [mapEntry("current"), mapEntry("other"), mapEntry("broken")];
const currentNodes = [createTestNode({ id: 1, label: "自分" }), createTestNode({ id: 2, label: "兄弟" })];
const otherNodes = [createTestNode({ id: 10, label: "参考" })];
const corpus: CrossMapCorpus = {
  readableMaps: [
    { mapId: "current", mapName: "マップ current", isCurrent: true, isArchived: false, nodes: currentNodes },
    { mapId: "other", mapName: "マップ other", isCurrent: false, isArchived: false, nodes: otherNodes },
  ],
  unreadableMaps: [{ mapId: "broken", mapName: "マップ broken", reason: "corrupt" }],
};
const base = {
  maps,
  corpus,
  currentMapId: "current",
  selectedNodeId: 1,
  draftTargetMapId: "other",
  draftTargetNodeId: "",
};

describe("resolveNodeMapLinkDraftTargets", () => {
  it("下書きのマップが一覧にあれば、そのマップのノードを候補にする", () => {
    expect(resolveNodeMapLinkDraftTargets({ ...base, draftTargetNodeId: "10" })).toEqual({
      targetMapId: "other",
      targetNodeId: "10",
      isTargetMapUnreadable: false,
      selectableNodes: otherNodes,
    });
  });

  it("現在のマップでは選択中のノード自身を候補から除く", () => {
    const resolved = resolveNodeMapLinkDraftTargets({ ...base, draftTargetMapId: "current" });
    expect(resolved.selectableNodes.map((node) => node.id)).toEqual([2]);
  });

  it("下書きのマップが一覧から消えたら先頭のマップへ戻し、ノードの下書きを捨てる", () => {
    expect(
      resolveNodeMapLinkDraftTargets({ ...base, draftTargetMapId: "gone", draftTargetNodeId: "2" }),
    ).toMatchObject({ targetMapId: "current", targetNodeId: "" });
  });

  it("読み取れないマップでは候補ノードを出さず、ノードの下書きを捨てる", () => {
    expect(
      resolveNodeMapLinkDraftTargets({ ...base, draftTargetMapId: "broken", draftTargetNodeId: "10" }),
    ).toEqual({
      targetMapId: "broken",
      targetNodeId: "",
      isTargetMapUnreadable: true,
      selectableNodes: [],
    });
  });

  it("候補に無いノードの下書きはマップ全体（空文字）へ戻す", () => {
    expect(
      resolveNodeMapLinkDraftTargets({ ...base, draftTargetNodeId: "999" }).targetNodeId,
    ).toBe("");
  });

  it("マップが1つも無ければ空の対象を返す", () => {
    expect(resolveNodeMapLinkDraftTargets({ ...base, maps: [], draftTargetMapId: "" })).toEqual({
      targetMapId: "",
      targetNodeId: "",
      isTargetMapUnreadable: false,
      selectableNodes: [],
    });
  });
});
