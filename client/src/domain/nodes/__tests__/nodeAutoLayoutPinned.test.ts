import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import { SIBLING_VERTICAL_GAP } from "@/config/shapes";
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

describe("layoutNodeForest layoutPinned", () => {
  it("ピン留めノードは動かず、非ピンは動く", () => {
    const pinned = node(2, 1, 220, 500, 100, 60, { layoutPinned: true });
    const result = layoutNodeForest([
      node(1, null, 0, 0),
      pinned,
      node(3, 1),
    ])!;

    expect(result.find(({ id }) => id === 2)).toMatchObject({ x: 220, y: 500 });
    expect(result.find(({ id }) => id === 2)).toBe(pinned);
    const sibling = result.find(({ id }) => id === 3)!;
    expect(sibling.x).not.toBe(0);
    expect(sibling.y).not.toBe(0);
  });

  it("ピン根サブツリーの span を避けて非ピン兄弟をパックする（単体 box 回避では落ちる例）", () => {
    // ピン B 本体は小さな box。ネストしたピン C が遠くにあり、B のサブツリー span は大きい。
    // 単体 box だけ避けた実装だと非ピン A が C と重なり得る。
    const result = layoutNodeForest([
      node(1, null, 0, 200),
      node(2, 1, 200, 0), // A non-pin
      node(3, 1, 200, 100, 100, 60, { layoutPinned: true }), // B pin
      node(4, 3, 400, 400, 100, 60, { layoutPinned: true }), // C nested pin far below
      node(5, 1, 200, 0), // D non-pin
    ])!;

    const a = result.find(({ id }) => id === 2)!;
    const b = result.find(({ id }) => id === 3)!;
    const c = result.find(({ id }) => id === 4)!;
    const d = result.find(({ id }) => id === 5)!;

    expect(b).toMatchObject({ x: 200, y: 100 });
    expect(c).toMatchObject({ x: 400, y: 400 });

    const pinSpanTop = Math.min(b.y, c.y);
    const pinSpanBottom = Math.max(b.y + b.height, c.y + c.height);

    // A はピン span の上、D は下（文書順）。いずれも span と siblingGap 以上離れる
    expect(a.y + a.height + SIBLING_VERTICAL_GAP).toBeLessThanOrEqual(pinSpanTop + 1e-9);
    expect(d.y).toBeGreaterThanOrEqual(pinSpanBottom + SIBLING_VERTICAL_GAP - 1e-9);

    // 単体 box（B だけ）回避だと A/D が C と重なり得る — C とも重ならないこと
    expect(a.y + a.height <= c.y || a.y >= c.y + c.height || a.x + a.width <= c.x || a.x >= c.x + c.width)
      .toBe(true);
    expect(d.y + d.height <= c.y || d.y >= c.y + c.height || d.x + d.width <= c.x || d.x >= c.x + c.width)
      .toBe(true);
  });

  it("ピン関与の間隔不足でも null にしない", () => {
    // ピン同士が siblingGap 未満でもレイアウト成功
    const result = layoutNodeForest([
      node(1, null, 0, 0),
      node(2, 1, 200, 0, 100, 60, { layoutPinned: true }),
      node(3, 1, 200, 10, 100, 60, { layoutPinned: true }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.find(({ id }) => id === 2)).toMatchObject({ y: 0 });
    expect(result!.find(({ id }) => id === 3)).toMatchObject({ y: 10 });
  });

  it("非ピン同士の間隔不足は null", () => {
    // 通常の大座標ギャップ丸め拒否（既存契約）— ピン無し
    expect(layoutNodeForest([
      node(1, null, 0, 2 ** 57),
      node(2, 1),
      node(3, 1),
    ])).toBeNull();
  });

  it("最も近いピン留め祖先をアンカーに非ピン子孫を配置する", () => {
    const pin = node(2, 1, 50, 300, 100, 60, { layoutPinned: true });
    const result = layoutNodeForest([
      node(1, null, 0, 0),
      pin,
      node(3, 2),
      node(4, 2),
    ])!;

    expect(result.find(({ id }) => id === 2)).toMatchObject({ x: 50, y: 300 });
    const childA = result.find(({ id }) => id === 3)!;
    const childB = result.find(({ id }) => id === 4)!;
    // ピンを局所ルートとして子が縦に並ぶ
    expect(childB.y).toBe(childA.y + childA.height + SIBLING_VERTICAL_GAP);
    // 親子の中心が揃う（ピン中心 ≈ 子グループ中心）
    expect(300 + 30).toBeCloseTo((childA.y + (childB.y + childB.height)) / 2, 5);
  });
});
