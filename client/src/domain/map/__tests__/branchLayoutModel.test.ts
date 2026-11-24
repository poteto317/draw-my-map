import {
  appendBranchLayouts,
  pruneBranchLayoutsAfterRemovedNodeIds,
  remapClosedBranchLayouts,
  rewriteBranchLayoutsAfterNodeMerge,
} from "@/domain/map/branchLayoutLifecycle";
import {
  areBranchLayoutsEqual,
  normalizeBranchLayouts,
  projectBranchLayouts,
  type BranchLayout,
} from "@/types/branchLayout";

const ids = new Set([1, 2, 3, 4]);

describe("normalizeBranchLayouts", () => {
  it("欠落・非配列は undefined", () => {
    expect(normalizeBranchLayouts(undefined, ids)).toBeUndefined();
    expect(normalizeBranchLayouts({ nodeId: 1 }, ids)).toBeUndefined();
  });

  it("有効エントリだけ残し、空は undefined", () => {
    expect(
      normalizeBranchLayouts(
        [
          { nodeId: 1, direction: "rl" },
          { nodeId: 9, direction: "lr" },
          { nodeId: 2, direction: "grid" },
          { nodeId: 2, direction: "tb" },
          { nodeId: 1, direction: "bt" },
          null,
          { nodeId: 3, direction: "bt" },
        ],
        ids,
      ),
    ).toEqual([
      { nodeId: 1, direction: "rl" },
      { nodeId: 2, direction: "tb" },
      { nodeId: 3, direction: "bt" },
    ]);
    expect(normalizeBranchLayouts([{ nodeId: 9, direction: "lr" }], ids)).toBeUndefined();
  });
});

describe("prune / remap / rewrite / append", () => {
  const layouts: readonly BranchLayout[] = [
    { nodeId: 1, direction: "rl" },
    { nodeId: 2, direction: "tb" },
    { nodeId: 3, direction: "bt" },
  ];

  it("pruneBranchLayoutsAfterRemovedNodeIds は削除 ID を落とす", () => {
    expect(pruneBranchLayoutsAfterRemovedNodeIds(layouts, [2, 9])).toEqual([
      { nodeId: 1, direction: "rl" },
      { nodeId: 3, direction: "bt" },
    ]);
    expect(pruneBranchLayoutsAfterRemovedNodeIds(layouts, [1, 2, 3])).toBeUndefined();
  });

  it("remapClosedBranchLayouts は閉じたエントリだけ写す", () => {
    const idMap = new Map([[2, 20], [3, 30]]);
    expect(remapClosedBranchLayouts(layouts, idMap)).toEqual([
      { nodeId: 20, direction: "tb" },
      { nodeId: 30, direction: "bt" },
    ]);
  });

  it("rewriteBranchLayoutsAfterNodeMerge は吸収を survivor に寄せ、既存があれば吸収側を捨てる", () => {
    expect(rewriteBranchLayoutsAfterNodeMerge(1, [2], layouts)).toEqual([
      { nodeId: 1, direction: "rl" },
      { nodeId: 3, direction: "bt" },
    ]);
    expect(
      rewriteBranchLayoutsAfterNodeMerge(4, [2], [
        { nodeId: 2, direction: "rl" },
        { nodeId: 3, direction: "tb" },
      ]),
    ).toEqual([
      { nodeId: 4, direction: "rl" },
      { nodeId: 3, direction: "tb" },
    ]);
    // 吸収が先でも survivor の方向を残す
    expect(
      rewriteBranchLayoutsAfterNodeMerge(1, [2], [
        { nodeId: 2, direction: "bt" },
        { nodeId: 1, direction: "rl" },
      ]),
    ).toEqual([{ nodeId: 1, direction: "rl" }]);
  });

  it("appendBranchLayouts と project / equal", () => {
    expect(appendBranchLayouts([{ nodeId: 1, direction: "lr" }], [{ nodeId: 2, direction: "rl" }])).toEqual([
      { nodeId: 1, direction: "lr" },
      { nodeId: 2, direction: "rl" },
    ]);
    expect(projectBranchLayouts([])).toEqual({});
    expect(projectBranchLayouts([{ nodeId: 1, direction: "rl" }])).toEqual({
      branchLayouts: [{ nodeId: 1, direction: "rl" }],
    });
    expect(areBranchLayoutsEqual([{ nodeId: 2, direction: "tb" }, { nodeId: 1, direction: "rl" }], layouts.slice(0, 2))).toBe(
      true,
    );
    expect(areBranchLayoutsEqual(undefined, [])).toBe(true);
    expect(areBranchLayoutsEqual(layouts, layouts.slice(0, 1))).toBe(false);
  });

  it("appendBranchLayouts は同一 nodeId を先勝ちで除去する（normalize と同型）", () => {
    expect(
      appendBranchLayouts(
        [{ nodeId: 1, direction: "lr" }, { nodeId: 2, direction: "tb" }],
        [{ nodeId: 2, direction: "bt" }, { nodeId: 3, direction: "rl" }, { nodeId: 1, direction: "rl" }],
      ),
    ).toEqual([
      { nodeId: 1, direction: "lr" },
      { nodeId: 2, direction: "tb" },
      { nodeId: 3, direction: "rl" },
    ]);
    expect(
      appendBranchLayouts(
        undefined,
        [{ nodeId: 1, direction: "rl" }, { nodeId: 1, direction: "bt" }],
      ),
    ).toEqual([{ nodeId: 1, direction: "rl" }]);
  });
});
