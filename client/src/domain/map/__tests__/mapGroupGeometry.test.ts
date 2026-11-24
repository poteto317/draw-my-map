import {
  computeGroupAabb,
  GROUP_FRAME_PADDING_PX,
  groupDisplayLabel,
  listDrawableMapGroups,
} from "@/domain/map/mapGroupGeometry";
import { createTestNode } from "@/testing/createTestNode";
import type { MapGroup } from "@/types/mapGroup";

function group(partial: Partial<MapGroup> & Pick<MapGroup, "id" | "nodeIds">): MapGroup {
  return { label: "", ...partial };
}

describe("computeGroupAabb", () => {
  it("メンバー AABB に 12px 余白を足す", () => {
    const nodes = [
      createTestNode({ id: 1, x: 0, y: 0, width: 100, height: 60 }),
      createTestNode({ id: 2, x: 200, y: 40, width: 100, height: 60 }),
    ];
    expect(computeGroupAabb(nodes, [1, 2])).toEqual({
      x: 0 - GROUP_FRAME_PADDING_PX,
      y: 0 - GROUP_FRAME_PADDING_PX,
      width: 300 + GROUP_FRAME_PADDING_PX * 2,
      height: 100 + GROUP_FRAME_PADDING_PX * 2,
    });
  });

  it("メンバー移動に追従する", () => {
    const before = [
      createTestNode({ id: 1, x: 0, y: 0, width: 100, height: 60 }),
      createTestNode({ id: 2, x: 200, y: 0, width: 100, height: 60 }),
    ];
    const after = [
      createTestNode({ id: 1, x: 0, y: 0, width: 100, height: 60 }),
      createTestNode({ id: 2, x: 400, y: 100, width: 100, height: 60 }),
    ];
    const a = computeGroupAabb(before, [1, 2])!;
    const b = computeGroupAabb(after, [1, 2])!;
    expect(b.width).toBeGreaterThan(a.width);
    expect(b.height).toBeGreaterThan(a.height);
  });

  it("可視メンバーが2未満なら null", () => {
    const nodes = [
      createTestNode({ id: 1, x: 0, y: 0, width: 100, height: 60 }),
      createTestNode({ id: 2, x: 200, y: 0, width: 100, height: 60 }),
    ];
    expect(computeGroupAabb(nodes, [1, 2], new Set([1]))).toBeNull();
    expect(computeGroupAabb(nodes, [1], undefined)).toBeNull();
  });
});

describe("groupDisplayLabel", () => {
  it("空ラベルは UI フォールバック「グループ」（永続しない）", () => {
    expect(groupDisplayLabel("")).toBe("グループ");
    expect(groupDisplayLabel("題名")).toBe("題名");
  });
});

describe("listDrawableMapGroups", () => {
  const nodes = [
    createTestNode({ id: 1, x: 0, y: 0, width: 100, height: 60 }),
    createTestNode({ id: 2, x: 200, y: 0, width: 100, height: 60 }),
    createTestNode({ id: 3, x: 200, y: 120, width: 100, height: 60 }),
  ];

  it("面積が大きい枠を先に並べる（背面＝先描画）", () => {
    const drawable = listDrawableMapGroups(
      [
        group({ id: 21, nodeIds: [2, 3], label: "小" }),
        group({ id: 20, nodeIds: [1, 2, 3], label: "大" }),
      ],
      nodes,
      new Set([1, 2, 3]),
    );
    expect(drawable.map((entry) => entry.group.id)).toEqual([20, 21]);
  });

  it("可視メンバーが2未満の枠は含めない", () => {
    expect(listDrawableMapGroups(
      [
        group({ id: 20, nodeIds: [1, 2] }),
        group({ id: 21, nodeIds: [2, 3] }),
      ],
      nodes,
      new Set([2, 3]),
    ).map((entry) => entry.group.id)).toEqual([21]);
  });

  it("groups が空／undefined なら空配列", () => {
    expect(listDrawableMapGroups(undefined, nodes, new Set([1, 2, 3]))).toEqual([]);
    expect(listDrawableMapGroups([], nodes, new Set([1, 2, 3]))).toEqual([]);
  });
});
