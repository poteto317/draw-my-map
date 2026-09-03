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
};

const pointer = (globalX: number, globalY: number) => ({ globalX, globalY });

describe("createNodeMoveGesture", () => {
  it("returns null when the source node is missing", () => {
    expect(createNodeMoveGesture({
      nodeId: 1,
      startEvent: pointer(100, 60) as never,
      nodesRef: { current: [] },
      onMoveNodeRef: { current: jest.fn() },
      dragThreshold: 4,
    })).toBeNull();
  });

  it("ignores movement below the threshold", () => {
    const onMoveNode = jest.fn();
    const gesture = createNodeMoveGesture({
      nodeId: 1,
      startEvent: pointer(100, 60) as never,
      nodesRef: { current: [node] },
      onMoveNodeRef: { current: onMoveNode },
      dragThreshold: 4,
    });

    gesture?.move(pointer(103, 63) as never);

    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it("preserves displacement after reaching the threshold", () => {
    const onMoveNode = jest.fn();
    const gesture = createNodeMoveGesture({
      nodeId: 1,
      startEvent: pointer(100, 60) as never,
      nodesRef: { current: [node] },
      onMoveNodeRef: { current: onMoveNode },
      dragThreshold: 4,
    });

    gesture?.move(pointer(104, 61) as never);
    gesture?.move(pointer(110, 66) as never);

    expect(onMoveNode).toHaveBeenNthCalledWith(1, 1, 24, 41);
    expect(onMoveNode).toHaveBeenNthCalledWith(2, 1, 30, 46);
  });

  it("preserves the start coordinates when Pixi reuses the pointer event object", () => {
    const onMoveNode = jest.fn();
    const reusedPointer = pointer(100, 60);
    const gesture = createNodeMoveGesture({
      nodeId: 1,
      startEvent: reusedPointer as never,
      nodesRef: { current: [node] },
      onMoveNodeRef: { current: onMoveNode },
      dragThreshold: 4,
    });

    reusedPointer.globalX = 104;
    reusedPointer.globalY = 61;
    gesture?.move(reusedPointer as never);

    expect(onMoveNode).toHaveBeenCalledWith(1, 24, 41);
  });

  it.each(["end", "cancel"] as const)(
    "uses the latest callback and stops after %s",
    (finish) => {
      const initial = jest.fn();
      const latest = jest.fn();
      const onMoveNodeRef = { current: initial };
      const gesture = createNodeMoveGesture({
        nodeId: 1,
        startEvent: pointer(100, 60) as never,
        nodesRef: { current: [node] },
        onMoveNodeRef,
        dragThreshold: 4,
      });
      onMoveNodeRef.current = latest;

      gesture?.move(pointer(104, 64) as never);
      if (finish === "end") {
        gesture?.end(pointer(104, 64) as never);
      } else {
        gesture?.cancel();
      }
      gesture?.move(pointer(110, 70) as never);

      expect(initial).not.toHaveBeenCalled();
      expect(latest).toHaveBeenCalledTimes(1);
    },
  );
});
