import { act, renderHook } from "@testing-library/react";
import { RECT_HEIGHT, RECT_WIDTH } from "@/config/shapes";
import { useNodes } from "@/hooks/useNodes";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(
  id: number,
  parentId: number | null,
  x = 0,
  y = 0,
  extras: Partial<Node> = {},
): Node {
  return createTestNode({
    id,
    parentId,
    x,
    y,
    width: RECT_WIDTH,
    height: RECT_HEIGHT,
    label: String(id),
    ...extras,
  });
}

describe("useNodes setLayoutStyle", () => {
  it("auto では orthogonal↔radial 切替で即リレイアウトされ、1 Undo で戻る", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "auto",
        nodes: [node(1, null, 0, 0), node(2, 1, 900, 900)],
      });
    });
    const before = result.current.nodes.find((n) => n.id === 2)!;

    act(() => {
      result.current.setLayoutStyle("radial");
    });
    expect(result.current.layoutStyle).toBe("radial");
    const afterRadial = result.current.nodes.find((n) => n.id === 2)!;
    expect(afterRadial.x).not.toBe(before.x);

    act(() => {
      result.current.setLayoutStyle("orthogonal");
    });
    expect(result.current.layoutStyle).toBeUndefined();
    const afterOrtho = result.current.nodes.find((n) => n.id === 2)!;
    expect(afterOrtho.x).not.toBe(afterRadial.x);

    act(() => {
      result.current.undo();
    });
    expect(result.current.layoutStyle).toBe("radial");
    expect(result.current.nodes.find((n) => n.id === 2)).toMatchObject({
      x: afterRadial.x,
      y: afterRadial.y,
    });

    act(() => {
      result.current.undo();
    });
    expect(result.current.layoutStyle).toBeUndefined();
    expect(result.current.nodes.find((n) => n.id === 2)).toMatchObject({
      x: before.x,
      y: before.y,
    });
  });

  it("manual では様式だけ更新し座標は不変", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "manual",
        nodes: [node(1, null, 10, 20), node(2, 1, 300, 400)],
      });
    });
    act(() => {
      result.current.setLayoutStyle("radial");
    });
    expect(result.current.layoutStyle).toBe("radial");
    expect(result.current.nodes.find((n) => n.id === 2)).toMatchObject({ x: 300, y: 400 });
  });

  it("関連線選択中は setLayoutStyle を拒否する", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "auto",
        nodes: [node(1, null), node(2, null)],
        relations: [{ id: 1, fromId: 1, toId: 2, kind: "related", directed: false }],
      });
      result.current.selectRelation(1);
    });
    act(() => {
      result.current.setLayoutStyle("radial");
    });
    expect(result.current.layoutStyle).toBeUndefined();
  });

  it("グループ選択中は setLayoutStyle を拒否する", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "auto",
        nodes: [node(1, null), node(2, 1)],
        groups: [{ id: 1, nodeIds: [1, 2], label: "g" }],
      });
      result.current.selectGroup(1);
    });
    act(() => {
      result.current.setLayoutStyle("radial");
    });
    expect(result.current.layoutStyle).toBeUndefined();
  });
});
