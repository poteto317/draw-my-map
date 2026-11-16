import { keepFirstRootPosition } from "@/domain/nodes/nodeFirstRootPosition";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, label: `N${id}`, x: id * 10, y: id * 20, ...overrides });
}

describe("keepFirstRootPosition", () => {
  it("先頭のルートが別のノードに入れ替わったとき、旧先頭の座標を新しい先頭のルートへ写す", () => {
    const previous = [node(1, null), node(2, null), node(3, 2)];
    const next = [node(2, null), node(3, 2)];

    const result = keepFirstRootPosition(previous, next);

    expect(result[0]).toEqual({ ...next[0], x: 10, y: 20 });
    expect(result[1]).toBe(next[1]);
  });

  it("先頭のルートが入れ替わらないときは、座標を変えない", () => {
    const previous = [node(1, null), node(2, 1)];
    const next = [node(1, null, { x: 999, y: 888 }), node(2, 1)];

    const result = keepFirstRootPosition(previous, next);

    expect(result).toEqual(next);
    expect(result[0]).toBe(next[0]);
  });

  it("旧い配列にルートが無いときは、座標を変えない", () => {
    const previous = [node(2, 1)];
    const next = [node(3, null)];

    expect(keepFirstRootPosition(previous, next)).toEqual(next);
  });

  it("新しい配列にルートが無いときは、座標を変えない", () => {
    const previous = [node(1, null)];
    const next = [node(2, 1)];

    expect(keepFirstRootPosition(previous, next)).toEqual(next);
  });

  it("元の配列とノードを変更せず、座標以外の属性を保つ", () => {
    const previous = [node(1, null), node(2, null, { label: "二", importance: "high", width: 77, height: 33 })];
    const next = [previous[1], node(3, 2)];
    const nextSnapshot = JSON.parse(JSON.stringify(next));
    const previousSnapshot = JSON.parse(JSON.stringify(previous));

    const result = keepFirstRootPosition(previous, next);

    expect(next).toEqual(nextSnapshot);
    expect(previous).toEqual(previousSnapshot);
    expect(result).not.toBe(next);
    expect(result[0]).toEqual({ ...previous[1], x: 10, y: 20 });
    expect(result[0].label).toBe("二");
    expect(result[0].width).toBe(77);
    expect(result[0].height).toBe(33);
  });
});
