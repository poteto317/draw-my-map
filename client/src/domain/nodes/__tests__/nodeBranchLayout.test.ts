import {
  applySetBranchLayout,
  effectiveBranchDirection,
} from "@/domain/nodes/nodeBranchLayout";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import {
  CHILD_HORIZONTAL_GAP,
  SIBLING_VERTICAL_GAP,
} from "@/config/shapes";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(
  id: number,
  parentId: number | null,
  x = 0,
  y = 0,
  width = 100,
  height = 60,
  extras: Partial<Node> = {},
): Node {
  return createTestNode({ id, parentId, x, y, width, height, label: `node-${id}`, ...extras });
}

function parentByIdFrom(nodes: readonly Node[]): ReadonlyMap<number, number | null> {
  return new Map(nodes.map((n) => [n.id, n.parentId]));
}

describe("effectiveBranchDirection", () => {
  const nodes = [node(1, null), node(2, 1), node(3, 2)];
  const parents = parentByIdFrom(nodes);

  it("未指定は文書方向、自分のエントリが最優先、次に最近祖先", () => {
    expect(effectiveBranchDirection(3, undefined, "lr", parents)).toBe("lr");
    expect(effectiveBranchDirection(3, [{ nodeId: 1, direction: "rl" }], "tb", parents)).toBe("rl");
    expect(effectiveBranchDirection(3, [
      { nodeId: 1, direction: "rl" },
      { nodeId: 3, direction: "bt" },
    ], "lr", parents)).toBe("bt");
    expect(effectiveBranchDirection(2, [
      { nodeId: 1, direction: "tb" },
      { nodeId: 3, direction: "bt" },
    ], "lr", parents)).toBe("tb");
  });
});

describe("applySetBranchLayout", () => {
  const nodes = [node(1, null), node(2, 1, 0, 0, 100, 60, { locked: true })];

  it("設定・null 削除・locked 拒否", () => {
    expect(applySetBranchLayout(nodes, undefined, 1, "rl")).toEqual({
      ok: true,
      branchLayouts: [{ nodeId: 1, direction: "rl" }],
    });
    expect(applySetBranchLayout(
      nodes,
      [{ nodeId: 1, direction: "rl" }, { nodeId: 2, direction: "tb" }],
      1,
      null,
    )).toEqual({
      ok: true,
      branchLayouts: [{ nodeId: 2, direction: "tb" }],
    });
    expect(applySetBranchLayout(nodes, undefined, 2, "lr")).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(applySetBranchLayout(nodes, undefined, 9, "lr")).toEqual({
      ok: false,
      reason: "node-missing",
    });
  });
});

describe("layoutNodeForest branchLayouts", () => {
  const spacing = { childGap: CHILD_HORIZONTAL_GAP, siblingGap: SIBLING_VERTICAL_GAP };

  it("rl は lr 配置の中心鏡映（親中心）で top-left に戻る", () => {
    const nodes = [node(1, null, 0, 0), node(2, 1, 900, 900)];
    const lr = layoutNodeForest(nodes, { direction: "lr", spacing })!;
    const childLr = lr.find((n) => n.id === 2)!;
    const root = lr.find((n) => n.id === 1)!;
    const ax = root.x + root.width / 2;
    const expectedCx = 2 * ax - (childLr.x + childLr.width / 2);
    const expectedX = expectedCx - childLr.width / 2;

    const rl = layoutNodeForest(nodes, {
      direction: "lr",
      spacing,
      branchLayouts: [{ nodeId: 1, direction: "rl" }],
    })!;
    expect(rl.find((n) => n.id === 1)).toMatchObject({ x: 0, y: 0 });
    expect(rl.find((n) => n.id === 2)).toMatchObject({ x: expectedX, y: childLr.y });
  });

  it("bt は tb 配置の中心鏡映", () => {
    const nodes = [node(1, null, 50, 70), node(2, 1), node(3, 1)];
    const tb = layoutNodeForest(nodes, { direction: "tb", spacing })!;
    const root = tb.find((n) => n.id === 1)!;
    const ay = root.y + root.height / 2;

    const bt = layoutNodeForest(nodes, {
      direction: "lr",
      spacing,
      branchLayouts: [{ nodeId: 1, direction: "bt" }],
    })!;
    expect(bt.find((n) => n.id === 1)).toMatchObject({ x: 50, y: 70 });
    for (const id of [2, 3]) {
      const fromTb = tb.find((n) => n.id === id)!;
      const fromBt = bt.find((n) => n.id === id)!;
      const expectedCy = 2 * ay - (fromTb.y + fromTb.height / 2);
      expect(fromBt.y).toBeCloseTo(expectedCy - fromTb.height / 2, 5);
      expect(fromBt.x).toBeCloseTo(fromTb.x, 5);
    }
  });

  it("混在時の親パックは子枝の仮配置 AABB の直交辺を span に使う", () => {
    // 親 lr。子2は tb（孫が横並びで AABB 高さが大きい）。子3は葉。
    // lr 仮配置の span だけだと子3の Y がずれる。
    const nodes = [
      node(1, null, 0, 200),
      node(2, 1),
      node(3, 1),
      node(4, 2),
      node(5, 2),
    ];
    const mixed = layoutNodeForest(nodes, {
      direction: "lr",
      spacing,
      branchLayouts: [{ nodeId: 2, direction: "tb" }],
    })!;
    const uniform = layoutNodeForest(nodes, { direction: "lr", spacing })!;

    const mixed3 = mixed.find((n) => n.id === 3)!;
    const uniform3 = uniform.find((n) => n.id === 3)!;
    // tb 枝の直交 span（高さ）は lr 枝より大きい → 子3のパック位置が変わる
    expect(mixed3.y).not.toBeCloseTo(uniform3.y, 5);

    const branch2 = [2, 4, 5].map((id) => mixed.find((n) => n.id === id)!);
    const minY = Math.min(...branch2.map((n) => n.y));
    const maxY = Math.max(...branch2.map((n) => n.y + n.height));
    // 子3は枝2の AABB と siblingGap 以上離れる
    expect(mixed3.y).toBeGreaterThanOrEqual(maxY + SIBLING_VERTICAL_GAP - 1e-9);
    expect(minY).toBeLessThan(mixed3.y);
  });

  it("radial では branchLayouts を配置に使わず値は options に残るだけ", () => {
    const nodes = [node(1, null, 0, 0), node(2, 1, 900, 900)];
    const without = layoutNodeForest(nodes, {
      direction: "lr",
      spacing,
      layoutStyle: "radial",
    })!;
    const withBranch = layoutNodeForest(nodes, {
      direction: "lr",
      spacing,
      layoutStyle: "radial",
      branchLayouts: [{ nodeId: 1, direction: "rl" }],
    })!;
    expect(withBranch.find((n) => n.id === 2)).toMatchObject({
      x: without.find((n) => n.id === 2)!.x,
      y: without.find((n) => n.id === 2)!.y,
    });
  });

  it("深さ2の nested rl は二重鏡映せず孫が前進方向の反対側に広がる", () => {
    // 1→2→3 がすべて rl（継承）。各逆転ノードで1回だけ鏡映なら、
    // 前進 lr の子・孫を根中心で一度だけ反転し、孫は子よりさらに左へ。
    // 二重鏡映だと孫が根付近へ潰れる。
    const nodes = [node(1, null, 0, 0), node(2, 1), node(3, 2)];
    const result = layoutNodeForest(nodes, {
      direction: "lr",
      spacing,
      branchLayouts: [{ nodeId: 1, direction: "rl" }],
    })!;
    const root = result.find((n) => n.id === 1)!;
    const child = result.find((n) => n.id === 2)!;
    const grand = result.find((n) => n.id === 3)!;

    expect(root).toMatchObject({ x: 0, y: 0 });
    // 子は根の左（rl）
    expect(child.x + child.width).toBeLessThanOrEqual(root.x + 1e-9);
    // 孫は子のさらに左 — 二重鏡映だと孫が根付近（x≈0）に潰れる
    expect(grand.x + grand.width).toBeLessThanOrEqual(child.x + 1e-9);
    expect(grand.x).toBeLessThan(child.x - CHILD_HORIZONTAL_GAP / 2);
  });

  it("深さ2の nested bt も二重鏡映で潰さない", () => {
    const nodes = [node(1, null, 50, 70), node(2, 1), node(3, 2)];
    const result = layoutNodeForest(nodes, {
      direction: "lr",
      spacing,
      branchLayouts: [{ nodeId: 1, direction: "bt" }],
    })!;
    const root = result.find((n) => n.id === 1)!;
    const child = result.find((n) => n.id === 2)!;
    const grand = result.find((n) => n.id === 3)!;

    expect(child.y + child.height).toBeLessThanOrEqual(root.y + 1e-9);
    expect(grand.y + grand.height).toBeLessThanOrEqual(child.y + 1e-9);
    expect(grand.y).toBeLessThan(child.y - CHILD_HORIZONTAL_GAP / 2);
  });

  it("branchLayouts 経路でも最近ピン祖先をアンカーにしピン子が剥離しない", () => {
    // 末尾スナップだけでは、ピン座標は戻るが子は通常パック位置のまま剥離する。
    const pin = node(2, 1, 50, 300, 100, 60, { layoutPinned: true });
    const result = layoutNodeForest([
      node(1, null, 0, 0),
      pin,
      node(3, 2),
      node(4, 2),
    ], {
      direction: "lr",
      spacing,
      branchLayouts: [{ nodeId: 1, direction: "lr" }],
    })!;

    expect(result.find((n) => n.id === 2)).toMatchObject({ x: 50, y: 300 });
    const childA = result.find((n) => n.id === 3)!;
    const childB = result.find((n) => n.id === 4)!;
    expect(childB.y).toBe(childA.y + childA.height + SIBLING_VERTICAL_GAP);
    // ピン中心 ≈ 子グループ中心（ピンを局所原点）
    expect(300 + 30).toBeCloseTo((childA.y + (childB.y + childB.height)) / 2, 5);
    // 子はピンの右（lr）に childGap で付く
    expect(childA.x).toBeCloseTo(50 + 100 + CHILD_HORIZONTAL_GAP, 5);
  });

  it("branchLayouts 経路でもピン根サブツリー span を避けて非ピン兄弟をパックする", () => {
    const result = layoutNodeForest([
      node(1, null, 0, 200),
      node(2, 1, 200, 0),
      node(3, 1, 200, 100, 100, 60, { layoutPinned: true }),
      node(4, 3, 400, 400, 100, 60, { layoutPinned: true }),
      node(5, 1, 200, 0),
    ], {
      direction: "lr",
      spacing,
      branchLayouts: [{ nodeId: 1, direction: "lr" }],
    })!;

    const a = result.find((n) => n.id === 2)!;
    const b = result.find((n) => n.id === 3)!;
    const c = result.find((n) => n.id === 4)!;
    const d = result.find((n) => n.id === 5)!;
    expect(b).toMatchObject({ x: 200, y: 100 });
    expect(c).toMatchObject({ x: 400, y: 400 });

    const pinSpanTop = Math.min(b.y, c.y);
    const pinSpanBottom = Math.max(b.y + b.height, c.y + c.height);
    expect(a.y + a.height + SIBLING_VERTICAL_GAP).toBeLessThanOrEqual(pinSpanTop + 1e-9);
    expect(d.y).toBeGreaterThanOrEqual(pinSpanBottom + SIBLING_VERTICAL_GAP - 1e-9);
  });

  it("branchLayouts 経路でもピン関与の間隔不足では null にしない", () => {
    const result = layoutNodeForest([
      node(1, null, 0, 0),
      node(2, 1, 200, 0, 100, 60, { layoutPinned: true }),
      node(3, 1, 200, 10, 100, 60, { layoutPinned: true }),
    ], {
      direction: "lr",
      spacing,
      branchLayouts: [{ nodeId: 1, direction: "lr" }],
    });
    expect(result).not.toBeNull();
    expect(result!.find((n) => n.id === 2)).toMatchObject({ y: 0 });
    expect(result!.find((n) => n.id === 3)).toMatchObject({ y: 10 });
  });

  it("非ピン子の配下に遠いピンがあっても相対計測で兄弟 span が壊れない", () => {
    // 子2とピンはワールドで原点から遠いが互いには近い。
    // 計測空間は子2を (0,0) に置くため、ピン絶対座標を書くと AABB が過大になる。
    const nodes = [
      node(1, null, 0, 200),
      node(2, 1, 4000, 4000),
      node(3, 2, 4100, 4100, 100, 60, { layoutPinned: true }),
      node(4, 1, 0, 0),
    ];
    const result = layoutNodeForest(nodes, {
      direction: "lr",
      spacing,
      branchLayouts: [{ nodeId: 1, direction: "lr" }],
    });
    expect(result).not.toBeNull();
    const child2 = result!.find((n) => n.id === 2)!;
    const child4 = result!.find((n) => n.id === 4)!;
    const pin = result!.find((n) => n.id === 3)!;
    expect(pin).toMatchObject({ x: 4100, y: 4100 });
    expect(Number.isFinite(child2.y)).toBe(true);
    expect(Number.isFinite(child4.y)).toBe(true);
    // 相対計測なら子2の直交 span はピン相対オフセット程度 → 子4は子2の近くにパックされる
    // 絶対座標混入だと span ≈ 4100 になり child4.y が数千ずれる
    expect(Math.abs(child4.y - child2.y)).toBeLessThan(500);
  });

  it("親 rl 下のピン子は局所原点として配下をピンの左側（rl）へ伸ばす", () => {
    const result = layoutNodeForest([
      node(1, null, 0, 0),
      node(2, 1, 300, 100, 100, 60, { layoutPinned: true }),
      node(3, 2),
    ], {
      direction: "lr",
      spacing,
      branchLayouts: [{ nodeId: 1, direction: "rl" }],
    })!;
    const pin = result.find((n) => n.id === 2)!;
    const grand = result.find((n) => n.id === 3)!;
    expect(pin).toMatchObject({ x: 300, y: 100 });
    // ピン実効方向は親から継承した rl → 孫はピンの左
    expect(grand.x + grand.width).toBeLessThanOrEqual(pin.x + 1e-9);
    expect(grand.x).toBeCloseTo(pin.x - CHILD_HORIZONTAL_GAP - grand.width, 5);
  });

  it("親 rl + 子明示 lr では子配下が子の右側へ伸びる", () => {
    const result = layoutNodeForest([
      node(1, null, 0, 0),
      node(2, 1),
      node(3, 2),
    ], {
      direction: "lr",
      spacing,
      branchLayouts: [
        { nodeId: 1, direction: "rl" },
        { nodeId: 2, direction: "lr" },
      ],
    })!;
    const root = result.find((n) => n.id === 1)!;
    const child = result.find((n) => n.id === 2)!;
    const grand = result.find((n) => n.id === 3)!;
    // 子は親の左（親 rl）
    expect(child.x + child.width).toBeLessThanOrEqual(root.x + 1e-9);
    // 孫は子の右（子明示 lr）— 親鏡映のままだと左に残る
    expect(grand.x).toBeGreaterThanOrEqual(child.x + child.width + CHILD_HORIZONTAL_GAP - 1e-9);
  });
});
