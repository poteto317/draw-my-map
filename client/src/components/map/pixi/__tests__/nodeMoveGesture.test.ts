import { createNodeMoveGesture } from "@/components/map/pixi/nodeMoveGesture";
import type { Node } from "@/types/node";

const node: Node = {
  id: 1,
  parentId: null,
  x: 20,
  y: 40,
  width: 100,
  height: 60,
  label: "Node",
  importance: "medium" as const,
};

const pointer = (
  screenX: number,
  screenY: number,
  worldX = screenX,
  worldY = screenY,
) => ({
  pointerId: 1,
  pointerType: "mouse",
  screen: { x: screenX, y: screenY },
  world: { x: worldX, y: worldY },
});

describe("createNodeMoveGesture", () => {
  it("returns null when the source node is missing", () => {
    expect(createNodeMoveGesture({
      nodeId: 1,
      startSample: pointer(100, 60),
      nodesRef: { current: [] },
      onMoveNodeRef: { current: jest.fn() },
      dragThreshold: 4,
    })).toBeNull();
  });

  it("ignores movement below the threshold", () => {
    const onMoveNode = jest.fn();
    const gesture = createNodeMoveGesture({
      nodeId: 1,
      startSample: pointer(100, 60),
      nodesRef: { current: [node] },
      onMoveNodeRef: { current: onMoveNode },
      dragThreshold: 4,
    });

    gesture?.move(pointer(103, 63));

    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it("preserves displacement after reaching the threshold", () => {
    const onMoveNode = jest.fn();
    const gesture = createNodeMoveGesture({
      nodeId: 1,
      startSample: pointer(100, 60),
      nodesRef: { current: [node] },
      onMoveNodeRef: { current: onMoveNode },
      dragThreshold: 4,
    });

    gesture?.move(pointer(104, 61));
    gesture?.move(pointer(110, 66));

    expect(onMoveNode).toHaveBeenNthCalledWith(1, 1, 24, 41);
    expect(onMoveNode).toHaveBeenNthCalledWith(2, 1, 30, 46);
  });

  it("画面ピクセルで閾値を判定しワールド差分で移動する", () => {
    const onMoveNode = jest.fn();
    const gesture = createNodeMoveGesture({
      nodeId: 1,
      startSample: pointer(100, 60, 50, 30),
      nodesRef: { current: [node] },
      onMoveNodeRef: { current: onMoveNode },
      dragThreshold: 4,
    });

    gesture?.move(pointer(104, 64, 52, 32));

    expect(onMoveNode).toHaveBeenCalledWith(1, node.x + 2, node.y + 2);
  });

  it("preserves the start coordinates when Pixi reuses the pointer event object", () => {
    const onMoveNode = jest.fn();
    const reusedPointer = pointer(100, 60);
    const gesture = createNodeMoveGesture({
      nodeId: 1,
      startSample: reusedPointer,
      nodesRef: { current: [node] },
      onMoveNodeRef: { current: onMoveNode },
      dragThreshold: 4,
    });

    reusedPointer.screen.x = 104;
    reusedPointer.screen.y = 61;
    reusedPointer.world.x = 104;
    reusedPointer.world.y = 61;
    gesture?.move(reusedPointer);

    expect(onMoveNode).toHaveBeenCalledWith(1, 24, 41);
  });

  it.each([
    pointer(Number.NaN, 60),
    pointer(100, 60, Number.POSITIVE_INFINITY, 60),
  ])("非有限の開始座標ではgestureを作らない", (startSample) => {
    expect(createNodeMoveGesture({
      nodeId: 1,
      startSample,
      nodesRef: { current: [node] },
      onMoveNodeRef: { current: jest.fn() },
      dragThreshold: 4,
    })).toBeNull();
  });

  it.each([
    pointer(Number.NaN, 64),
    pointer(104, 64, Number.POSITIVE_INFINITY, 64),
  ])("非有限の現在座標を移動callbackへ渡さない", (currentSample) => {
    const onMoveNode = jest.fn();
    const gesture = createNodeMoveGesture({
      nodeId: 1,
      startSample: pointer(100, 60),
      nodesRef: { current: [node] },
      onMoveNodeRef: { current: onMoveNode },
      dragThreshold: 4,
    });

    gesture?.move(currentSample);

    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it("有限値同士の演算がoverflowする移動をcallbackへ渡さない", () => {
    const onMoveNode = jest.fn();
    const gesture = createNodeMoveGesture({
      nodeId: 1,
      startSample: pointer(0, 0),
      nodesRef: { current: [{ ...node, x: Number.MAX_VALUE }] },
      onMoveNodeRef: { current: onMoveNode },
      dragThreshold: 4,
    });

    gesture?.move(pointer(4, 0, Number.MAX_VALUE, 0));

    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it.each(["end", "cancel"] as const)(
    "uses the latest callback and stops after %s",
    (finish) => {
      const initial = jest.fn();
      const latest = jest.fn();
      const onMoveNodeRef = { current: initial };
      const gesture = createNodeMoveGesture({
        nodeId: 1,
        startSample: pointer(100, 60),
        nodesRef: { current: [node] },
        onMoveNodeRef,
        dragThreshold: 4,
      });
      onMoveNodeRef.current = latest;

      gesture?.move(pointer(104, 64));
      if (finish === "end") {
        gesture?.end(pointer(104, 64));
      } else {
        gesture?.cancel();
      }
      gesture?.move(pointer(110, 70));

      expect(initial).not.toHaveBeenCalled();
      expect(latest).toHaveBeenCalledTimes(1);
    },
  );
});
