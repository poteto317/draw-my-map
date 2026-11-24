import {
  planAddGroup,
  planRemoveGroup,
  planUpdateGroupLabel,
} from "@/domain/map/mapGroupMutation";
import { createTestNode } from "@/testing/createTestNode";
import type { MapGroup } from "@/types/mapGroup";

function group(partial: Partial<MapGroup> & Pick<MapGroup, "id" | "nodeIds">): MapGroup {
  return { label: "", ...partial };
}

const nodes = [
  createTestNode({ id: 1, label: "a" }),
  createTestNode({ id: 2, parentId: 1, label: "b", x: 200 }),
  createTestNode({ id: 3, parentId: 1, label: "c", x: 200, y: 100 }),
  createTestNode({ id: 4, parentId: 1, label: "locked", x: 200, y: 200, locked: true }),
];

describe("planAddGroup", () => {
  it("2件以上のノードでグループを作る", () => {
    expect(planAddGroup({
      nodes,
      groups: undefined,
      nodeIds: [1, 2],
      newId: 20,
    })).toEqual({
      ok: true,
      group: group({ id: 20, nodeIds: [1, 2] }),
      groups: [group({ id: 20, nodeIds: [1, 2] })],
    });
  });

  it("同一ノードの複数グループ所属を許可する", () => {
    const existing = [group({ id: 20, nodeIds: [1, 2], label: "first" })];
    expect(planAddGroup({
      nodes,
      groups: existing,
      nodeIds: [1, 2, 3],
      newId: 21,
      label: "second",
    })).toEqual({
      ok: true,
      group: group({ id: 21, nodeIds: [1, 2, 3], label: "second" }),
      groups: [
        group({ id: 20, nodeIds: [1, 2], label: "first" }),
        group({ id: 21, nodeIds: [1, 2, 3], label: "second" }),
      ],
    });
  });

  it("メンバーいずれか locked なら拒否する（L-1061）", () => {
    expect(planAddGroup({
      nodes,
      groups: undefined,
      nodeIds: [1, 4],
      newId: 20,
    })).toEqual({ ok: false, reason: "locked" });
  });

  it("1件未満・欠落は拒否する", () => {
    expect(planAddGroup({
      nodes,
      groups: undefined,
      nodeIds: [1],
      newId: 20,
    })).toEqual({ ok: false, reason: "too-few" });
    expect(planAddGroup({
      nodes,
      groups: undefined,
      nodeIds: [1, 99],
      newId: 20,
    })).toEqual({ ok: false, reason: "missing-node" });
  });

  it("100コードポイント超のラベルは拒否する（update と同則）", () => {
    expect(planAddGroup({
      nodes,
      groups: undefined,
      nodeIds: [1, 2],
      newId: 20,
      label: "あ".repeat(101),
    })).toEqual({ ok: false, reason: "too-long" });
  });
});

describe("planRemoveGroup", () => {
  it("グループを削除し、メンバーノードは残す", () => {
    const existing = [
      group({ id: 20, nodeIds: [1, 2] }),
      group({ id: 21, nodeIds: [2, 3] }),
    ];
    expect(planRemoveGroup({ nodes, groups: existing, groupId: 20 })).toEqual({
      ok: true,
      groups: [group({ id: 21, nodeIds: [2, 3] })],
    });
  });

  it("最後の1件を消すと groups を undefined にする", () => {
    expect(planRemoveGroup({
      nodes,
      groups: [group({ id: 20, nodeIds: [1, 2] })],
      groupId: 20,
    })).toEqual({ ok: true, groups: undefined });
  });

  it("メンバーいずれか locked なら拒否する", () => {
    expect(planRemoveGroup({
      nodes,
      groups: [group({ id: 20, nodeIds: [1, 4] })],
      groupId: 20,
    })).toEqual({ ok: false, reason: "locked" });
  });

  it("存在しない id は missing", () => {
    expect(planRemoveGroup({
      nodes,
      groups: [group({ id: 20, nodeIds: [1, 2] })],
      groupId: 99,
    })).toEqual({ ok: false, reason: "missing" });
  });
});

describe("planUpdateGroupLabel", () => {
  it("ラベルを更新する（空文字可）", () => {
    const existing = [group({ id: 20, nodeIds: [1, 2], label: "old" })];
    expect(planUpdateGroupLabel({
      nodes,
      groups: existing,
      groupId: 20,
      label: "",
    })).toEqual({
      ok: true,
      group: group({ id: 20, nodeIds: [1, 2], label: "" }),
      groups: [group({ id: 20, nodeIds: [1, 2], label: "" })],
    });
  });

  it("100コードポイント超は拒否する", () => {
    const existing = [group({ id: 20, nodeIds: [1, 2] })];
    const tooLong = "あ".repeat(101);
    expect(planUpdateGroupLabel({
      nodes,
      groups: existing,
      groupId: 20,
      label: tooLong,
    })).toEqual({ ok: false, reason: "too-long" });
  });

  it("メンバー locked / 無変更 / 欠落を拒否する", () => {
    expect(planUpdateGroupLabel({
      nodes,
      groups: [group({ id: 20, nodeIds: [1, 4], label: "x" })],
      groupId: 20,
      label: "y",
    })).toEqual({ ok: false, reason: "locked" });
    expect(planUpdateGroupLabel({
      nodes,
      groups: [group({ id: 20, nodeIds: [1, 2], label: "same" })],
      groupId: 20,
      label: "same",
    })).toEqual({ ok: false, reason: "noop" });
    expect(planUpdateGroupLabel({
      nodes,
      groups: [group({ id: 20, nodeIds: [1, 2] })],
      groupId: 99,
      label: "x",
    })).toEqual({ ok: false, reason: "missing" });
  });
});
