import {
  canPickRelationPartner,
  listRelationPartnerCandidates,
  resolveRelationAddContextMenu,
  resolveRelationConnectContextMenu,
  resolveRelationDeleteAvailability,
  resolveRelationMeaningEditAvailability,
} from "@/domain/map/mapRelationAvailability";
import { createTestNode } from "@/testing/createTestNode";
import type { MapRelation } from "@/types/mapRelation";

function relation(partial: Partial<MapRelation> & Pick<MapRelation, "id" | "fromId" | "toId">): MapRelation {
  return { kind: "related", directed: false, ...partial };
}

const nodes = [
  createTestNode({ id: 1, label: "a" }),
  createTestNode({ id: 2, parentId: 1, label: "b", x: 200 }),
  createTestNode({ id: 3, parentId: 1, label: "c", x: 200, y: 100 }),
  createTestNode({ id: 4, parentId: 1, label: "locked", x: 200, y: 200, locked: true }),
];

const openDoc = {
  viewMode: "map" as const,
  isProtectedMode: false,
  hasConflict: false,
  isExternallyDeleted: false,
};

describe("resolveRelationAddContextMenu", () => {
  it("マップ・主選択ちょうど1・コンテキストがその主選択のとき visible", () => {
    expect(resolveRelationAddContextMenu({
      ...openDoc,
      selectedNodeId: 1,
      selectedNodeIds: [1],
      contextMenuNodeId: 1,
      nodes,
      relations: undefined,
    })).toEqual({ visible: true, disabled: false });
  });

  it("アウトラインでは非表示", () => {
    expect(resolveRelationAddContextMenu({
      ...openDoc,
      viewMode: "outline",
      selectedNodeId: 1,
      selectedNodeIds: [1],
      contextMenuNodeId: 1,
      nodes,
      relations: undefined,
    }).visible).toBe(false);
  });

  it("保護・競合・locked で disabled", () => {
    expect(resolveRelationAddContextMenu({
      ...openDoc,
      isProtectedMode: true,
      selectedNodeId: 1,
      selectedNodeIds: [1],
      contextMenuNodeId: 1,
      nodes,
      relations: undefined,
    }).disabled).toBe(true);

    expect(resolveRelationAddContextMenu({
      ...openDoc,
      hasConflict: true,
      selectedNodeId: 1,
      selectedNodeIds: [1],
      contextMenuNodeId: 1,
      nodes,
      relations: undefined,
    }).disabled).toBe(true);

    expect(resolveRelationAddContextMenu({
      ...openDoc,
      selectedNodeId: 4,
      selectedNodeIds: [4],
      contextMenuNodeId: 4,
      nodes,
      relations: undefined,
    }).disabled).toBe(true);
  });
});

describe("resolveRelationConnectContextMenu", () => {
  it("選択ちょうど2のとき visible", () => {
    expect(resolveRelationConnectContextMenu({
      ...openDoc,
      selectedNodeIds: [1, 2],
      nodes,
      relations: undefined,
    })).toEqual({ visible: true, disabled: false });
  });

  it("重複・locked・保護で disabled", () => {
    expect(resolveRelationConnectContextMenu({
      ...openDoc,
      selectedNodeIds: [1, 2],
      nodes,
      relations: [relation({ id: 10, fromId: 1, toId: 2 })],
    }).disabled).toBe(true);

    expect(resolveRelationConnectContextMenu({
      ...openDoc,
      selectedNodeIds: [1, 4],
      nodes,
      relations: undefined,
    }).disabled).toBe(true);

    expect(resolveRelationConnectContextMenu({
      ...openDoc,
      isProtectedMode: true,
      selectedNodeIds: [1, 2],
      nodes,
      relations: undefined,
    }).disabled).toBe(true);
  });
});

describe("resolveRelationDeleteAvailability / canPickRelationPartner", () => {
  it("保護・競合・locked で削除不可", () => {
    const r = relation({ id: 10, fromId: 1, toId: 2 });
    expect(resolveRelationDeleteAvailability({
      ...openDoc,
      nodes,
      relation: r,
    }).enabled).toBe(true);
    expect(resolveRelationDeleteAvailability({
      ...openDoc,
      isProtectedMode: true,
      nodes,
      relation: r,
    }).enabled).toBe(false);
    expect(resolveRelationDeleteAvailability({
      ...openDoc,
      nodes,
      relation: relation({ id: 10, fromId: 1, toId: 4 }),
    }).enabled).toBe(false);
  });

  it("相手 locked / 重複はピッカー候補として選べない", () => {
    expect(canPickRelationPartner({
      nodes,
      relations: undefined,
      fromId: 1,
      toId: 4,
    })).toBe(false);
    expect(canPickRelationPartner({
      nodes,
      relations: [relation({ id: 10, fromId: 1, toId: 2 })],
      fromId: 1,
      toId: 2,
    })).toBe(false);
    expect(canPickRelationPartner({
      nodes,
      relations: undefined,
      fromId: 1,
      toId: 3,
    })).toBe(true);
  });

  it("意味編集も保護・locked で不可（N5）", () => {
    const r = relation({ id: 10, fromId: 1, toId: 2 });
    expect(resolveRelationMeaningEditAvailability({
      ...openDoc,
      nodes,
      relation: r,
    }).enabled).toBe(true);
    expect(resolveRelationMeaningEditAvailability({
      ...openDoc,
      hasConflict: true,
      nodes,
      relation: r,
    }).enabled).toBe(false);
    expect(resolveRelationMeaningEditAvailability({
      ...openDoc,
      nodes,
      relation: relation({ id: 10, fromId: 1, toId: 4 }),
    }).enabled).toBe(false);
  });
});

describe("listRelationPartnerCandidates", () => {
  it("fromId 自身を除き、locked / 重複は enabled:false", () => {
    const listed = listRelationPartnerCandidates({
      nodes,
      relations: [relation({ id: 10, fromId: 1, toId: 2 })],
      fromId: 1,
    });
    expect(listed.map((entry) => ({ id: entry.node.id, enabled: entry.enabled }))).toEqual([
      { id: 2, enabled: false },
      { id: 3, enabled: true },
      { id: 4, enabled: false },
    ]);
  });

  it("候補なし（ノードが fromId のみ）なら空配列", () => {
    expect(listRelationPartnerCandidates({
      nodes: [nodes[0]!],
      relations: undefined,
      fromId: 1,
    })).toEqual([]);
  });
});
