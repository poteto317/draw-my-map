import {
  createShiftNodePendingGesture,
  resolveVisibleOrderedIds,
} from "@/components/map/pixi/shiftNodePendingGesture";
import type { PointerSample } from "@/components/map/pixi/pointerGesture";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

const nodes: Node[] = [
  createTestNode({ id: 1, x: 0, y: 0, width: 100, height: 60, label: "A" }),
  createTestNode({ id: 2, x: 200, y: 0, width: 100, height: 60, label: "B" }),
  createTestNode({ id: 3, x: 400, y: 0, width: 100, height: 60, label: "C" }),
];

const pointer = (
  screenX: number,
  screenY: number,
  worldX = screenX,
  worldY = screenY,
): PointerSample => ({
  pointerId: 1,
  pointerType: "mouse",
  screen: { x: screenX, y: screenY },
  world: { x: worldX, y: worldY },
});

describe("resolveVisibleOrderedIds", () => {
  it("visible 未指定なら全ノードの ID を配列順で返す", () => {
    expect(resolveVisibleOrderedIds(nodes, undefined)).toEqual([1, 2, 3]);
  });

  it("visible 指定時は見えるノードだけ配列順で返す", () => {
    expect(resolveVisibleOrderedIds(nodes, new Set([3, 1]))).toEqual([1, 3]);
  });
});

describe("createShiftNodePendingGesture", () => {
  function createGesture() {
    const onSelectNodeRef = { current: jest.fn() };
    const onSelectNodeRangeRef = { current: jest.fn() };
    const onConnectNodesRef = { current: jest.fn() };
    const onConnectionTargetChangeRef = { current: jest.fn() };
    const gesture = createShiftNodePendingGesture({
      nodeId: 2,
      startSample: pointer(50, 50),
      nodesRef: { current: nodes },
      visibleNodeIdsRef: { current: new Set([1, 2, 3]) },
      onSelectNodeRef,
      onSelectNodeRangeRef,
      onConnectNodesRef,
      onConnectionTargetChangeRef,
      dragThreshold: 4,
    });
    return {
      gesture,
      onSelectNodeRef,
      onSelectNodeRangeRef,
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    };
  }

  it("未 activated の end は範囲選択し、選択置換も接続もしない", () => {
    const { gesture, onSelectNodeRef, onSelectNodeRangeRef, onConnectNodesRef } = createGesture();

    gesture?.move(pointer(52, 50));
    expect(gesture?.isActivated?.()).toBe(false);
    gesture?.end(pointer(52, 50));

    expect(onSelectNodeRangeRef.current).toHaveBeenCalledWith(2, [1, 2, 3]);
    expect(onSelectNodeRef.current).not.toHaveBeenCalled();
    expect(onConnectNodesRef.current).not.toHaveBeenCalled();
  });

  it("しきい値超で単一置換して接続ジェスチャーへ移り、範囲選択しない", () => {
    const {
      gesture,
      onSelectNodeRef,
      onSelectNodeRangeRef,
      onConnectionTargetChangeRef,
    } = createGesture();

    gesture?.move(pointer(50, 60));
    expect(gesture?.isActivated?.()).toBe(true);
    expect(onSelectNodeRef.current).toHaveBeenCalledWith(2);
    expect(onConnectionTargetChangeRef.current).toHaveBeenCalled();

    gesture?.end(pointer(50, 60));
    expect(onSelectNodeRangeRef.current).not.toHaveBeenCalled();
  });

  it("cancel は未 activated でも範囲選択しない", () => {
    const { gesture, onSelectNodeRangeRef } = createGesture();
    gesture?.cancel();
    expect(onSelectNodeRangeRef.current).not.toHaveBeenCalled();
  });

  it("非有限座標の startSample では null", () => {
    const gesture = createShiftNodePendingGesture({
      nodeId: 1,
      startSample: {
        pointerId: 1,
        pointerType: "mouse",
        screen: { x: Number.NaN, y: 0 },
        world: { x: Number.NaN, y: 0 },
      },
      nodesRef: { current: nodes },
      onSelectNodeRef: { current: jest.fn() },
      onConnectNodesRef: { current: jest.fn() },
      onConnectionTargetChangeRef: { current: jest.fn() },
      dragThreshold: 4,
    });
    expect(gesture).toBeNull();
  });
});
