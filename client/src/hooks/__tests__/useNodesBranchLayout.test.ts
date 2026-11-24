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

describe("useNodes setBranchLayout", () => {
  it("auto+orthogonal では設定と同時に即リレイアウト（1 Undo）", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "auto",
        nodes: [node(1, null, 0, 0), node(2, 1, 900, 900)],
      });
    });
    const before = result.current.nodes.find((n) => n.id === 2)!;

    act(() => {
      expect(result.current.setBranchLayout(1, "rl")).toEqual({ ok: true });
    });
    expect(result.current.branchLayouts).toEqual([{ nodeId: 1, direction: "rl" }]);
    const after = result.current.nodes.find((n) => n.id === 2)!;
    expect(after.x).not.toBe(before.x);

    act(() => {
      result.current.undo();
    });
    expect(result.current.branchLayouts).toBeUndefined();
    expect(result.current.nodes.find((n) => n.id === 2)).toMatchObject({
      x: before.x,
      y: before.y,
    });
  });

  it("null で文書の既定に戻し、エントリ削除", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "auto",
        nodes: [node(1, null, 0, 0), node(2, 1)],
        branchLayouts: [{ nodeId: 1, direction: "rl" }],
      });
    });
    act(() => {
      expect(result.current.setBranchLayout(1, null)).toEqual({ ok: true });
    });
    expect(result.current.branchLayouts).toBeUndefined();
  });

  it("manual では配列のみ更新し座標は不変", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "manual",
        nodes: [node(1, null, 10, 20), node(2, 1, 300, 400)],
      });
    });
    act(() => {
      expect(result.current.setBranchLayout(1, "bt")).toEqual({ ok: true });
    });
    expect(result.current.branchLayouts).toEqual([{ nodeId: 1, direction: "bt" }]);
    expect(result.current.nodes.find((n) => n.id === 2)).toMatchObject({ x: 300, y: 400 });
  });

  it("radial では配列のみ更新し座標は不変", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "auto",
        layoutStyle: "radial",
        nodes: [node(1, null, 10, 20), node(2, 1, 300, 400)],
      });
    });
    const before = result.current.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));
    act(() => {
      expect(result.current.setBranchLayout(1, "rl")).toEqual({ ok: true });
    });
    expect(result.current.branchLayouts).toEqual([{ nodeId: 1, direction: "rl" }]);
    expect(result.current.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }))).toEqual(before);
  });

  it("locked は拒否", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "auto",
        nodes: [node(1, null, 0, 0, { locked: true })],
      });
    });
    act(() => {
      expect(result.current.setBranchLayout(1, "rl")).toEqual({
        ok: false,
        reason: "locked",
      });
    });
  });

  it("ノード削除で branchLayouts が GC される", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "auto",
        nodes: [node(1, null, 0, 0), node(2, 1)],
        branchLayouts: [{ nodeId: 2, direction: "tb" }],
      });
    });
    act(() => {
      result.current.deleteNode(2);
    });
    expect(result.current.branchLayouts).toBeUndefined();
  });
});
