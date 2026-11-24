import {
  canCommitRelation,
  relationConflictKey,
} from "@/domain/map/relationConflict";
import {
  pruneAfterRemovedNodeIds,
  pruneSourceAfterBranchMove,
  remapClosedForNodeIdMap,
  rewriteAfterNodeMerge,
} from "@/domain/map/relationGroupLifecycle";
import {
  collectUsedEntityIds,
  normalizeGroups,
  normalizeRelations,
} from "@/domain/map/relationGroupModel";
import { createNodeIdAllocator } from "@/domain/nodes/nodeIdAllocator";
import { createTestNode } from "@/testing/createTestNode";
import type { MapGroup } from "@/types/mapGroup";
import type { MapRelation } from "@/types/mapRelation";
import type { NodeMapState } from "@/types/nodeMapState";

function nodeIds(...ids: number[]) {
  return new Set(ids);
}

function relation(partial: Partial<MapRelation> & Pick<MapRelation, "id" | "fromId" | "toId">): MapRelation {
  return {
    kind: "related",
    directed: false,
    ...partial,
  };
}

function group(partial: Partial<MapGroup> & Pick<MapGroup, "id" | "nodeIds">): MapGroup {
  return {
    label: "",
    ...partial,
  };
}

describe("normalizeRelations", () => {
  const nodes = nodeIds(1, 2, 3);

  it("非配列・欠落は undefined（キー無視）", () => {
    expect(normalizeRelations(undefined, nodes)).toBeUndefined();
    expect(normalizeRelations("x", nodes)).toBeUndefined();
    expect(normalizeRelations(null, nodes)).toBeUndefined();
    expect(normalizeRelations({}, nodes)).toBeUndefined();
  });

  it("不正エントリを除去し、空なら undefined", () => {
    expect(
      normalizeRelations(
        [
          { id: 10, fromId: 1, toId: 1, kind: "related", directed: false },
          { id: 11, fromId: 1, toId: 9, kind: "related", directed: false },
          { id: 12, fromId: 1, toId: 2, kind: "unknown", directed: false },
          { id: 0, fromId: 1, toId: 2, kind: "related", directed: false },
          { id: 13, fromId: 1, toId: 2, kind: "related", directed: false },
        ],
        nodes,
      ),
    ).toEqual([relation({ id: 13, fromId: 1, toId: 2 })]);
  });

  it("重複 entity id は先勝ち。ノード id との衝突も除去", () => {
    expect(
      normalizeRelations(
        [
          relation({ id: 1, fromId: 2, toId: 3 }),
          relation({ id: 10, fromId: 1, toId: 2, kind: "dependency" }),
          relation({ id: 10, fromId: 1, toId: 3, kind: "conflict" }),
        ],
        nodes,
      ),
    ).toEqual([relation({ id: 10, fromId: 1, toId: 2, kind: "dependency" })]);
  });

  it("重複キーは id 昇順で1本残す。無向と有向の混在も衝突", () => {
    expect(
      normalizeRelations(
        [
          relation({ id: 30, fromId: 2, toId: 1, directed: false }),
          relation({ id: 20, fromId: 1, toId: 2, directed: true, kind: "dependency" }),
          relation({ id: 25, fromId: 1, toId: 2, directed: true, kind: "conflict" }),
        ],
        nodes,
      ),
    ).toEqual([relation({ id: 20, fromId: 1, toId: 2, directed: true, kind: "dependency" })]);
  });
});

describe("normalizeGroups", () => {
  const nodes = nodeIds(1, 2, 3);

  it("非配列は undefined。label>100CP・nodeIds<2・欠落IDは除去", () => {
    expect(normalizeGroups(undefined, nodes)).toBeUndefined();
    expect(normalizeGroups("x", nodes)).toBeUndefined();
    expect(
      normalizeGroups(
        [
          { id: 40, nodeIds: [1], label: "" },
          { id: 41, nodeIds: [1, 9], label: "" },
          { id: 42, nodeIds: [1, 2], label: "あ".repeat(101) },
          { id: 43, nodeIds: [2, 1, 2], label: "ok" },
          { id: 0, nodeIds: [1, 2], label: "" },
        ],
        nodes,
      ),
    ).toEqual([group({ id: 43, nodeIds: [2, 1], label: "ok" })]);
  });

  it("reservedEntityIds（ノード・relation）と衝突する group は除去", () => {
    const reserved = new Set([1, 2, 3, 10]);
    expect(
      normalizeGroups(
        [
          group({ id: 10, nodeIds: [1, 2], label: "rel-id" }),
          group({ id: 2, nodeIds: [1, 3], label: "node-id" }),
          group({ id: 50, nodeIds: [1, 2], label: "ok" }),
        ],
        nodes,
        reserved,
      ),
    ).toEqual([group({ id: 50, nodeIds: [1, 2], label: "ok" })]);
  });
});

describe("relationConflictKey / canCommitRelation", () => {
  it("無向は端点を正規化したキー、有向は向き付き", () => {
    expect(relationConflictKey(relation({ id: 1, fromId: 2, toId: 1 }))).toBe(
      relationConflictKey(relation({ id: 2, fromId: 1, toId: 2 })),
    );
    expect(relationConflictKey(relation({ id: 1, fromId: 1, toId: 2, directed: true }))).not.toBe(
      relationConflictKey(relation({ id: 2, fromId: 2, toId: 1, directed: true })),
    );
  });

  it("追加・更新とも重複規則で拒否。ignoreId は自分を除外", () => {
    const existing = [
      relation({ id: 10, fromId: 1, toId: 2, directed: false }),
      relation({ id: 11, fromId: 1, toId: 3, directed: true }),
    ];
    expect(canCommitRelation(existing, relation({ id: 99, fromId: 2, toId: 1 }))).toBe(false);
    expect(canCommitRelation(existing, relation({ id: 99, fromId: 1, toId: 2, directed: true }))).toBe(false);
    expect(canCommitRelation(existing, relation({ id: 99, fromId: 3, toId: 1, directed: true }))).toBe(true);
    expect(
      canCommitRelation(existing, relation({ id: 10, fromId: 1, toId: 2, kind: "dependency" }), 10),
    ).toBe(true);
    expect(
      canCommitRelation(existing, relation({ id: 11, fromId: 1, toId: 2, directed: false }), 11),
    ).toBe(false);
  });
});

describe("collectUsedEntityIds / nextAvailableEntityIds", () => {
  it("nodes∪relations∪groups の id を集め、採番はそれらを避ける", () => {
    const state: Pick<NodeMapState, "nodes" | "relations" | "groups"> = {
      nodes: [createTestNode({ id: 1 }), createTestNode({ id: 3 })],
      relations: [relation({ id: 2, fromId: 1, toId: 3 })],
      groups: [group({ id: 5, nodeIds: [1, 3] })],
    };
    expect(collectUsedEntityIds(state).sort((a, b) => a - b)).toEqual([1, 2, 3, 5]);

    const makeAllocator = () => createNodeIdAllocator(() => {
      let n = 0;
      return () => {
        n += 1;
        return n;
      };
    });
    expect(makeAllocator().nextAvailableEntityIds(state, 2)).toEqual([4, 6]);
    expect(makeAllocator().nextAvailableIds(state.nodes, 1)).toEqual([2]);
  });
});

describe("pruneAfterRemovedNodeIds", () => {
  it("端点欠損の relation を消し、group は ID 除去後 2 未満なら削除", () => {
    const relations = [
      relation({ id: 10, fromId: 1, toId: 2 }),
      relation({ id: 11, fromId: 2, toId: 3 }),
    ];
    const groups = [
      group({ id: 20, nodeIds: [1, 2, 3] }),
      group({ id: 21, nodeIds: [1, 2] }),
    ];
    expect(pruneAfterRemovedNodeIds(relations, groups, [1])).toEqual({
      relations: [relation({ id: 11, fromId: 2, toId: 3 })],
      groups: [group({ id: 20, nodeIds: [2, 3] })],
    });
    expect(pruneAfterRemovedNodeIds(relations, groups, [1, 2, 3])).toEqual({
      relations: undefined,
      groups: undefined,
    });
  });
});

describe("pruneSourceAfterBranchMove", () => {
  it("交差する group は縮めず削除し、非交差 group と端点外 relation は残す", () => {
    const relations = [
      relation({ id: 10, fromId: 1, toId: 2 }),
      relation({ id: 11, fromId: 8, toId: 9 }),
    ];
    const groups = [
      group({ id: 20, nodeIds: [1, 8, 9], label: "split" }),
      group({ id: 21, nodeIds: [8, 9], label: "outside" }),
      group({ id: 22, nodeIds: [1, 2], label: "closed" }),
    ];
    expect(pruneSourceAfterBranchMove(relations, groups, [1, 2])).toEqual({
      relations: [relation({ id: 11, fromId: 8, toId: 9 })],
      groups: [group({ id: 21, nodeIds: [8, 9], label: "outside" })],
    });
  });
});

describe("rewriteAfterNodeMerge", () => {
  it("吸収 ID を survivor にリライトし、自己ループ削除・衝突は id 昇順で残す", () => {
    const relations = [
      relation({ id: 30, fromId: 2, toId: 3, directed: true }),
      relation({ id: 31, fromId: 1, toId: 2, directed: true }),
      relation({ id: 32, fromId: 3, toId: 1, directed: true }),
      relation({ id: 33, fromId: 2, toId: 3, directed: true, kind: "conflict" }),
    ];
    const groups = [
      group({ id: 40, nodeIds: [1, 2, 3], label: "g" }),
      group({ id: 41, nodeIds: [2, 3] }),
    ];
    expect(rewriteAfterNodeMerge(1, [2], relations, groups)).toEqual({
      relations: [
        relation({ id: 30, fromId: 1, toId: 3, directed: true }),
        relation({ id: 32, fromId: 3, toId: 1, directed: true }),
      ],
      groups: [group({ id: 40, nodeIds: [1, 3], label: "g" }), group({ id: 41, nodeIds: [1, 3] })],
    });
  });
});

describe("remapClosedForNodeIdMap", () => {
  it("閉じた relation/group だけ remap。境界横断・分割グループは捨てる", () => {
    const relations = [
      relation({ id: 10, fromId: 1, toId: 2 }),
      relation({ id: 11, fromId: 1, toId: 3 }),
    ];
    const groups = [
      group({ id: 20, nodeIds: [1, 2], label: "closed" }),
      group({ id: 21, nodeIds: [1, 2, 3], label: "split" }),
    ];
    const idMap = new Map<number, number>([
      [1, 101],
      [2, 102],
      [10, 210],
      [20, 220],
    ]);
    expect(remapClosedForNodeIdMap(relations, groups, idMap)).toEqual({
      relations: [relation({ id: 210, fromId: 101, toId: 102 })],
      groups: [group({ id: 220, nodeIds: [101, 102], label: "closed" })],
    });
  });
});
