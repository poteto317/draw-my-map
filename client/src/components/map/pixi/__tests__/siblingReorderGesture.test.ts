import { createSiblingReorderGesture } from "@/components/map/pixi/siblingReorderGesture";
import type { SiblingReorderPreview } from "@/components/map/siblingReorderDropSlot";
import type { SiblingReorderRequest } from "@/domain/nodes/nodeSiblingOrder";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import { createTestNode } from "@/testing/createTestNode";

const nodes: readonly Node[] = [
  createTestNode({ id: 1, parentId: null, x: 0, y: 150, label: "R" }),
  createTestNode({ id: 2, parentId: 1, x: 220, y: 0, label: "A" }),
  createTestNode({ id: 3, parentId: 1, x: 220, y: 100, label: "T" }),
  createTestNode({ id: 4, parentId: 1, x: 220, y: 200, label: "B" }),
  createTestNode({ id: 5, parentId: 1, x: 220, y: 300, label: "C" }),
];

// screen はしきい値の判定に、world.y は挿入位置の判定に使う
const pointer = (screenX: number, screenY: number, worldY: number) => ({
  pointerId: 1,
  pointerType: "mouse",
  screen: { x: screenX, y: screenY },
  world: { x: 270, y: worldY },
});

function createGesture(startSample = pointer(100, 100, 130), currentNodes: readonly Node[] = nodes) {
  const nodesRef: { current: readonly Node[] } = { current: currentNodes };
  const visibleNodeIdsRef: { current: ReadonlySet<number> } = {
    current: new Set(currentNodes.map((node) => node.id)),
  };
  const layoutModeRef: { current: NodeLayoutMode } = { current: "auto" };
  const onReorderSibling = jest.fn<void, [number, SiblingReorderRequest]>();
  const onPreviewChange = jest.fn<void, [SiblingReorderPreview | null]>();
  const gesture = createSiblingReorderGesture({
    nodeId: 3,
    startSample,
    nodesRef,
    visibleNodeIdsRef,
    layoutModeRef,
    onReorderSiblingRef: { current: onReorderSibling },
    onSiblingReorderPreviewChangeRef: { current: onPreviewChange },
    dragThreshold: 4,
  });
  return { gesture, nodesRef, visibleNodeIdsRef, layoutModeRef, onReorderSibling, onPreviewChange };
}

function createActiveGesture() {
  const result = createGesture();
  if (!result.gesture) throw new Error("gesture was not created");
  return { ...result, gesture: result.gesture };
}

describe("createSiblingReorderGesture", () => {
  it("しきい値未満の移動ではプレビューも並べ替えも起きない", () => {
    const { gesture, onReorderSibling, onPreviewChange } = createActiveGesture();

    gesture.move(pointer(103, 103, 250));
    gesture.end(pointer(103, 103, 250));

    expect(onPreviewChange).not.toHaveBeenCalled();
    expect(onReorderSibling).not.toHaveBeenCalled();
  });

  it("挿入位置が変わったときだけプレビューを更新する", () => {
    const { gesture, onPreviewChange } = createActiveGesture();

    gesture.move(pointer(100, 110, 150));
    expect(onPreviewChange).toHaveBeenCalledTimes(1);
    expect(onPreviewChange).toHaveBeenLastCalledWith({ nodeId: 3, indicator: null });

    gesture.move(pointer(100, 115, 160));
    gesture.move(pointer(100, 120, 170));
    expect(onPreviewChange).toHaveBeenCalledTimes(1);

    gesture.move(pointer(100, 200, 250));
    expect(onPreviewChange).toHaveBeenCalledTimes(2);
    expect(onPreviewChange).toHaveBeenLastCalledWith({
      nodeId: 3,
      indicator: { left: 212, right: 328, y: 280 },
    });
  });

  it("ドラッグ中に兄弟の座標が変わったら、同じ slot でも次の move で線を最新の座標に合わせる", () => {
    const { gesture, nodesRef, onPreviewChange } = createActiveGesture();

    gesture.move(pointer(100, 200, 250));
    expect(onPreviewChange).toHaveBeenLastCalledWith({
      nodeId: 3,
      indicator: { left: 212, right: 328, y: 280 },
    });

    // 自動配置で B が 10 下へずれる（B の中心は 240 で、ポインタ 255 でも slot は同じ）
    nodesRef.current = nodes.map((node) => node.id === 4 ? { ...node, y: 210 } : node);
    gesture.move(pointer(100, 205, 255));

    expect(onPreviewChange).toHaveBeenCalledTimes(2);
    expect(onPreviewChange).toHaveBeenLastCalledWith({
      nodeId: 3,
      indicator: { left: 212, right: 328, y: 285 },
    });
  });

  it("離すとプレビューを null に戻してから並べ替えを要求する", () => {
    const { gesture, onReorderSibling, onPreviewChange } = createActiveGesture();

    gesture.move(pointer(100, 200, 250));
    gesture.end(pointer(100, 200, 250));

    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
    expect(onReorderSibling).toHaveBeenCalledTimes(1);
    expect(onReorderSibling).toHaveBeenCalledWith(3, {
      kind: "drop",
      target: { position: "after", anchorId: 4 },
    });
    const resetOrder = onPreviewChange.mock.invocationCallOrder.at(-1) ?? Infinity;
    expect(resetOrder).toBeLessThan(onReorderSibling.mock.invocationCallOrder[0]);
  });

  it("離した時点の最新のノードで挿入位置を求め直す", () => {
    const { gesture, nodesRef, onReorderSibling } = createActiveGesture();

    gesture.move(pointer(100, 200, 250));
    nodesRef.current = nodes.map((node) => node.id === 5 ? { ...node, y: 150 } : node);
    gesture.end(pointer(100, 200, 250));

    expect(onReorderSibling).toHaveBeenCalledWith(3, {
      kind: "drop",
      target: { position: "after", anchorId: 5 },
    });
  });

  it("元の位置で離すとプレビューは戻すが並べ替えない", () => {
    const { gesture, onReorderSibling, onPreviewChange } = createActiveGesture();

    gesture.move(pointer(100, 200, 250));
    gesture.end(pointer(100, 110, 150));

    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
    expect(onReorderSibling).not.toHaveBeenCalled();
  });

  it("cancel の後の end では並べ替えない", () => {
    const { gesture, onReorderSibling, onPreviewChange } = createActiveGesture();

    gesture.move(pointer(100, 200, 250));
    gesture.cancel();
    gesture.end(pointer(100, 200, 250));

    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
    expect(onReorderSibling).not.toHaveBeenCalled();
  });

  it("end と cancel を重ねて呼んでも、プレビューを戻すのも並べ替えも1回だけ", () => {
    const twiceEnd = createActiveGesture();
    twiceEnd.gesture.move(pointer(100, 200, 250));
    twiceEnd.gesture.end(pointer(100, 200, 250));
    twiceEnd.gesture.end(pointer(100, 200, 250));
    twiceEnd.gesture.cancel();
    expect(twiceEnd.onPreviewChange.mock.calls.filter(([preview]) => preview === null)).toHaveLength(1);
    expect(twiceEnd.onReorderSibling).toHaveBeenCalledTimes(1);

    const twiceCancel = createActiveGesture();
    twiceCancel.gesture.move(pointer(100, 200, 250));
    twiceCancel.gesture.cancel();
    twiceCancel.gesture.cancel();
    expect(twiceCancel.onPreviewChange.mock.calls.filter(([preview]) => preview === null)).toHaveLength(1);
    expect(twiceCancel.onReorderSibling).not.toHaveBeenCalled();
  });

  it("cancel の後の move ではプレビューを更新しない", () => {
    const { gesture, onPreviewChange } = createActiveGesture();

    gesture.move(pointer(100, 200, 250));
    gesture.cancel();
    gesture.move(pointer(100, 0, 10));

    expect(onPreviewChange).toHaveBeenCalledTimes(2);
    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
  });

  it("移動中に手動配置になったら中止し、以後の end で並べ替えない", () => {
    const { gesture, layoutModeRef, onReorderSibling, onPreviewChange } = createActiveGesture();

    gesture.move(pointer(100, 200, 250));
    layoutModeRef.current = "manual";
    gesture.move(pointer(100, 200, 250));
    expect(onPreviewChange).toHaveBeenLastCalledWith(null);

    layoutModeRef.current = "auto";
    gesture.end(pointer(100, 200, 250));
    expect(onReorderSibling).not.toHaveBeenCalled();
  });

  it("離す時点で手動配置なら並べ替えない", () => {
    const { gesture, layoutModeRef, onReorderSibling, onPreviewChange } = createActiveGesture();

    gesture.move(pointer(100, 200, 250));
    layoutModeRef.current = "manual";
    gesture.end(pointer(100, 200, 250));

    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
    expect(onReorderSibling).not.toHaveBeenCalled();
  });

  it("有限でない座標の move は無視する", () => {
    const { gesture, onPreviewChange } = createActiveGesture();

    gesture.move(pointer(100, 200, Number.NaN));
    gesture.move(pointer(Number.POSITIVE_INFINITY, 200, 250));

    expect(onPreviewChange).not.toHaveBeenCalled();
  });

  it("有限でない座標の end は中止と同じ", () => {
    const { gesture, onReorderSibling, onPreviewChange } = createActiveGesture();

    gesture.move(pointer(100, 200, 250));
    gesture.end(pointer(100, 200, Number.NaN));
    gesture.end(pointer(100, 200, 250));

    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
    expect(onReorderSibling).not.toHaveBeenCalled();
  });

  it("world.y が有限でも screen が有限でない end は中止と同じ", () => {
    const { gesture, onReorderSibling, onPreviewChange } = createActiveGesture();

    gesture.move(pointer(100, 200, 250));
    gesture.end(pointer(Number.NaN, 200, 250));

    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
    expect(onReorderSibling).not.toHaveBeenCalled();
  });

  it("始めた時点で T が無いか、開始の座標が有限でなければ null", () => {
    expect(createGesture(pointer(100, 100, 130), nodes.filter((node) => node.id !== 3)).gesture)
      .toBeNull();
    expect(createGesture(pointer(100, 100, Number.NaN)).gesture).toBeNull();
  });

  it("activeNodeIds は T の ID だけ", () => {
    const { gesture } = createActiveGesture();

    expect(gesture.activeNodeIds?.()).toEqual([3]);
  });
});
