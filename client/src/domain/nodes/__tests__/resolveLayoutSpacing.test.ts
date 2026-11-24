import { CHILD_HORIZONTAL_GAP, SIBLING_VERTICAL_GAP } from "@/config/shapes";
import {
  resolveLayoutNodeForestOptions,
  resolveLayoutSpacing,
  resolveTreeDirection,
} from "@/domain/nodes/nodeMapLayoutContext";

describe("resolveLayoutSpacing", () => {
  it("欠落時は shapes の既定間隔を返す", () => {
    expect(resolveLayoutSpacing({})).toEqual({
      childGap: CHILD_HORIZONTAL_GAP,
      siblingGap: SIBLING_VERTICAL_GAP,
    });
  });

  it("マップに設定があるときはその値を返す", () => {
    expect(resolveLayoutSpacing({
      layoutSpacing: { childGap: 64, siblingGap: 24 },
    })).toEqual({ childGap: 64, siblingGap: 24 });
  });
});

describe("resolveTreeDirection", () => {
  it("欠落時は lr", () => {
    expect(resolveTreeDirection({})).toBe("lr");
  });

  it("保存値を返す", () => {
    expect(resolveTreeDirection({ treeDirection: "tb" })).toBe("tb");
  });
});

describe("resolveLayoutNodeForestOptions", () => {
  it("方向と間隔をまとめて解決する", () => {
    expect(resolveLayoutNodeForestOptions({
      treeDirection: "tb",
      layoutSpacing: { childGap: 100, siblingGap: 32 },
    })).toEqual({
      direction: "tb",
      spacing: { childGap: 100, siblingGap: 32 },
    });
  });

  it("layoutStyle と branchLayouts を options へ渡す（欠落は載せない）", () => {
    expect(resolveLayoutNodeForestOptions({
      treeDirection: "lr",
      layoutSpacing: { childGap: 64, siblingGap: 24 },
      layoutStyle: "radial",
      branchLayouts: [{ nodeId: 1, direction: "rl" }],
    })).toEqual({
      direction: "lr",
      spacing: { childGap: 64, siblingGap: 24 },
      layoutStyle: "radial",
      branchLayouts: [{ nodeId: 1, direction: "rl" }],
    });

    expect(resolveLayoutNodeForestOptions({
      treeDirection: "lr",
      layoutSpacing: undefined,
    })).toEqual({
      direction: "lr",
      spacing: { childGap: CHILD_HORIZONTAL_GAP, siblingGap: SIBLING_VERTICAL_GAP },
    });
  });
});