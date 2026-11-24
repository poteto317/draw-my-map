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

describe("useNodes layoutPinned", () => {
  it("付与でピンし auto なら即リレイアウト、解除で再配置、1 Undo", () => {
    const { result } = renderHook(() => useNodes());
    const root = node(1, null, 0, 0);
    const child = node(2, 1, 900, 900);

    act(() => {
      result.current.replaceMap({ layoutMode: "auto", nodes: [root, child] });
    });
    const beforePin = result.current.nodes.find((n) => n.id === 2)!;

    act(() => {
      expect(result.current.setNodeLayoutPinned(2, true)).toEqual({ ok: true });
    });
    expect(result.current.nodes.find((n) => n.id === 2)?.layoutPinned).toBe(true);
    // ピン座標は維持
    expect(result.current.nodes.find((n) => n.id === 2)).toMatchObject({
      x: beforePin.x,
      y: beforePin.y,
    });

    act(() => {
      expect(result.current.setNodeLayoutPinned(2, false)).toEqual({ ok: true });
    });
    const afterUnpin = result.current.nodes.find((n) => n.id === 2)!;
    expect(afterUnpin.layoutPinned).toBeUndefined();
    // 解除後は非ピンとして再配置され得る
    expect(afterUnpin.x !== 900 || afterUnpin.y !== 900).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(result.current.nodes.find((n) => n.id === 2)?.layoutPinned).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(result.current.nodes.find((n) => n.id === 2)?.layoutPinned).toBeUndefined();
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
      expect(result.current.setNodeLayoutPinned(1, true)).toEqual({
        ok: false,
        reason: "locked",
      });
    });
  });

  it("ピンドラッグ中は当該ノードのみ動き子孫は追従しない", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "auto",
        nodes: [
          node(1, null, 0, 0),
          node(2, 1, 220, 100, { layoutPinned: true }),
          node(3, 2, 440, 100),
        ],
      });
    });
    const childBefore = result.current.nodes.find((n) => n.id === 3)!;

    act(() => {
      result.current.beginMoveHistory();
      result.current.movePinnedNode(2, 220, 400);
    });

    expect(result.current.nodes.find((n) => n.id === 2)).toMatchObject({ x: 220, y: 400 });
    expect(result.current.nodes.find((n) => n.id === 3)).toMatchObject({
      x: childBefore.x,
      y: childBefore.y,
    });
  });

  it("ピンドラッグ＋ドロップ後リレイアウトは 1 Undo", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "auto",
        nodes: [
          node(1, null, 0, 0),
          node(2, 1, 220, 100, { layoutPinned: true }),
          node(3, 2, 440, 100),
        ],
      });
    });
    const beforeGesture = result.current.nodes.find((n) => n.id === 2)!;
    let childDuringDrag = { x: 0, y: 0 };

    act(() => {
      const lease = result.current.beginMoveHistory();
      result.current.movePinnedNode(2, 220, 400);
      const child = result.current.nodes.find((n) => n.id === 3)!;
      childDuringDrag = { x: child.x, y: child.y };
      result.current.finalizePinnedNodeMove();
      lease.finish();
    });

    expect(result.current.nodes.find((n) => n.id === 2)).toMatchObject({ x: 220, y: 400 });
    expect(result.current.nodes.find((n) => n.id === 2)?.layoutPinned).toBe(true);
    // ドロップ後リレイアウトで子孫がピン局所原点として更新される（ドラッグ中のまま残らない）
    const childAfter = result.current.nodes.find((n) => n.id === 3)!;
    expect(childAfter.x !== childDuringDrag.x || childAfter.y !== childDuringDrag.y).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(result.current.nodes.find((n) => n.id === 2)).toMatchObject({
      x: beforeGesture.x,
      y: beforeGesture.y,
    });
  });

  it("非ピンは movePinnedNode を拒否し、並べ替え経路のまま", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "auto",
        nodes: [node(1, null, 0, 0), node(2, 1, 200, 0)],
      });
    });
    let moved = true;
    act(() => {
      moved = result.current.movePinnedNode(2, 200, 80);
    });
    expect(moved).toBe(false);
  });
});
