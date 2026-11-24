import {
  planAddRelation,
  planRemoveRelation,
  planUpdateRelation,
} from "@/domain/map/mapRelationMutation";
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

describe("planAddRelation", () => {
  it("既定は related / 無向で追加する", () => {
    const result = planAddRelation({
      nodes,
      relations: undefined,
      fromId: 1,
      toId: 2,
      newId: 10,
    });
    expect(result).toEqual({
      ok: true,
      relation: relation({ id: 10, fromId: 1, toId: 2 }),
      relations: [relation({ id: 10, fromId: 1, toId: 2 })],
    });
  });

  it("重複キーは拒否する", () => {
    const existing = [relation({ id: 10, fromId: 1, toId: 2 })];
    expect(planAddRelation({
      nodes,
      relations: existing,
      fromId: 2,
      toId: 1,
      newId: 11,
    })).toEqual({ ok: false, reason: "duplicate" });
  });

  it("関与ノードが locked なら拒否する（L-1061）", () => {
    expect(planAddRelation({
      nodes,
      relations: undefined,
      fromId: 1,
      toId: 4,
      newId: 10,
    })).toEqual({ ok: false, reason: "locked" });
  });

  it("自己ループ・欠落ノードは拒否する", () => {
    expect(planAddRelation({
      nodes,
      relations: undefined,
      fromId: 1,
      toId: 1,
      newId: 10,
    })).toEqual({ ok: false, reason: "same-node" });
    expect(planAddRelation({
      nodes,
      relations: undefined,
      fromId: 1,
      toId: 99,
      newId: 10,
    })).toEqual({ ok: false, reason: "missing-node" });
  });
});

describe("planRemoveRelation", () => {
  it("関連線を削除する", () => {
    const existing = [
      relation({ id: 10, fromId: 1, toId: 2 }),
      relation({ id: 11, fromId: 2, toId: 3 }),
    ];
    expect(planRemoveRelation({ nodes, relations: existing, relationId: 10 })).toEqual({
      ok: true,
      relations: [relation({ id: 11, fromId: 2, toId: 3 })],
    });
  });

  it("最後の1本を消すと relations を undefined にする", () => {
    expect(planRemoveRelation({
      nodes,
      relations: [relation({ id: 10, fromId: 1, toId: 2 })],
      relationId: 10,
    })).toEqual({ ok: true, relations: undefined });
  });

  it("両端いずれか locked なら拒否する", () => {
    expect(planRemoveRelation({
      nodes,
      relations: [relation({ id: 10, fromId: 1, toId: 4 })],
      relationId: 10,
    })).toEqual({ ok: false, reason: "locked" });
  });

  it("存在しない id は missing", () => {
    expect(planRemoveRelation({
      nodes,
      relations: [relation({ id: 10, fromId: 1, toId: 2 })],
      relationId: 99,
    })).toEqual({ ok: false, reason: "missing" });
  });
});

describe("planUpdateRelation", () => {
  it("kind / directed を更新する", () => {
    const existing = [relation({ id: 10, fromId: 1, toId: 2 })];
    expect(planUpdateRelation({
      nodes,
      relations: existing,
      relationId: 10,
      kind: "dependency",
    })).toEqual({
      ok: true,
      relation: relation({ id: 10, fromId: 1, toId: 2, kind: "dependency" }),
      relations: [relation({ id: 10, fromId: 1, toId: 2, kind: "dependency" })],
    });
    expect(planUpdateRelation({
      nodes,
      relations: existing,
      relationId: 10,
      directed: true,
    })).toEqual({
      ok: true,
      relation: relation({ id: 10, fromId: 1, toId: 2, directed: true }),
      relations: [relation({ id: 10, fromId: 1, toId: 2, directed: true })],
    });
  });

  it("更新時も重複規則で拒否する（有向の逆向きがあるとき無向化など）", () => {
    const existing = [
      relation({ id: 10, fromId: 1, toId: 2, directed: true }),
      relation({ id: 11, fromId: 2, toId: 1, directed: true, kind: "dependency" }),
    ];
    expect(planUpdateRelation({
      nodes,
      relations: existing,
      relationId: 10,
      directed: false,
    })).toEqual({ ok: false, reason: "duplicate" });
  });

  it("両端いずれか locked なら拒否する", () => {
    expect(planUpdateRelation({
      nodes,
      relations: [relation({ id: 10, fromId: 1, toId: 4 })],
      relationId: 10,
      kind: "conflict",
    })).toEqual({ ok: false, reason: "locked" });
  });

  it("無変更は noop、欠落は missing", () => {
    const existing = [relation({ id: 10, fromId: 1, toId: 2, kind: "reference" })];
    expect(planUpdateRelation({
      nodes,
      relations: existing,
      relationId: 10,
      kind: "reference",
    })).toEqual({ ok: false, reason: "noop" });
    expect(planUpdateRelation({
      nodes,
      relations: existing,
      relationId: 99,
      kind: "conflict",
    })).toEqual({ ok: false, reason: "missing" });
  });
});
