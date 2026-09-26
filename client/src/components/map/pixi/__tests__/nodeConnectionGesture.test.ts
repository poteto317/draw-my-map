import { createNodeConnectionGesture } from "@/components/map/pixi/nodeConnectionGesture";
import type { PointerSample } from "@/components/map/pixi/pointerGesture";
import type { Node } from "@/types/node";

const source: Node = {
  id: 1,
  parentId: null,
  x: 20,
  y: 40,
  width: 100,
  height: 60,
  label: "Source",
  importance: "medium" as const,
};
const target: Node = { ...source, id: 2, x: 200, label: "Target" , importance: "medium" as const};

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

function createGesture(nodes: readonly Node[] = [source, target]) {
  const onConnectNodesRef = { current: jest.fn() };
  const onConnectionTargetChangeRef = { current: jest.fn() };
  const gesture = createNodeConnectionGesture({
    sourceNodeId: 1,
    nodesRef: { current: nodes },
    onConnectNodesRef,
    onConnectionTargetChangeRef,
  });
  return { gesture, onConnectNodesRef, onConnectionTargetChangeRef };
}

describe("createNodeConnectionGesture", () => {
  it("returns null when the source node is missing", () => {
    const { gesture } = createGesture([target]);

    expect(gesture).toBeNull();
  });

  it("notifies only when the valid target changes", () => {
    const { gesture, onConnectionTargetChangeRef } = createGesture();

    gesture?.move(pointer(220, 60));
    gesture?.move(pointer(230, 70));
    gesture?.move(pointer(500, 500));

    expect(onConnectionTargetChangeRef.current.mock.calls).toEqual([[2], [null]]);
  });

  it("connects from the source to the pointerup target without pointermove", () => {
    const { gesture, onConnectNodesRef, onConnectionTargetChangeRef } = createGesture();

    gesture?.end(pointer(220, 60));

    expect(onConnectNodesRef.current).toHaveBeenCalledWith(1, 2);
    expect(onConnectionTargetChangeRef.current).toHaveBeenLastCalledWith(null);
  });

  it("非等倍viewportで接続先をワールド座標から判定する", () => {
    const { gesture, onConnectionTargetChangeRef } = createGesture();

    gesture?.move(pointer(440, 120, 220, 60));

    expect(onConnectionTargetChangeRef.current).toHaveBeenCalledWith(2);
  });

  it("rejects a target that would create a cycle", () => {
    const parent = { ...source, parentId: null };
    const child = { ...target, parentId: 1 };
    const onConnectNodesRef = { current: jest.fn() };
    const onConnectionTargetChangeRef = { current: jest.fn() };
    const gesture = createNodeConnectionGesture({
      sourceNodeId: 2,
      nodesRef: { current: [parent, child] },
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    });

    gesture?.move(pointer(50, 50));
    gesture?.end(pointer(50, 50));

    expect(onConnectionTargetChangeRef.current).not.toHaveBeenCalledWith(1);
    expect(onConnectNodesRef.current).not.toHaveBeenCalled();
  });

  it("does not connect when pointerup is on empty space", () => {
    const { gesture, onConnectNodesRef, onConnectionTargetChangeRef } = createGesture();

    gesture?.end(pointer(500, 500));

    expect(onConnectNodesRef.current).not.toHaveBeenCalled();
    expect(onConnectionTargetChangeRef.current).toHaveBeenLastCalledWith(null);
  });

  it("cancels without connecting and clears the candidate", () => {
    const { gesture, onConnectNodesRef, onConnectionTargetChangeRef } = createGesture();

    gesture?.move(pointer(220, 60));
    gesture?.cancel();

    expect(onConnectNodesRef.current).not.toHaveBeenCalled();
    expect(onConnectionTargetChangeRef.current.mock.calls).toEqual([[2], [null]]);
  });

  it("ignores move and end after completion", () => {
    const { gesture, onConnectNodesRef, onConnectionTargetChangeRef } = createGesture();

    gesture?.cancel();
    gesture?.move(pointer(220, 60));
    gesture?.end(pointer(220, 60));

    expect(onConnectNodesRef.current).not.toHaveBeenCalled();
    expect(onConnectionTargetChangeRef.current.mock.calls).toEqual([[null]]);
  });

  it("uses the latest nodes and callbacks", () => {
    const initialConnect = jest.fn();
    const latestConnect = jest.fn();
    const initialTargetChange = jest.fn();
    const latestTargetChange = jest.fn();
    const nodesRef = { current: [source] as readonly Node[] };
    const onConnectNodesRef = { current: initialConnect };
    const onConnectionTargetChangeRef = { current: initialTargetChange };
    const gesture = createNodeConnectionGesture({
      sourceNodeId: 1,
      nodesRef,
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    });

    nodesRef.current = [source, target];
    onConnectNodesRef.current = latestConnect;
    onConnectionTargetChangeRef.current = latestTargetChange;
    gesture?.move(pointer(220, 60));
    gesture?.end(pointer(220, 60));

    expect(initialConnect).not.toHaveBeenCalled();
    expect(initialTargetChange).not.toHaveBeenCalled();
    expect(latestConnect).toHaveBeenCalledWith(1, 2);
    expect(latestTargetChange.mock.calls).toEqual([[2], [null]]);
  });

  it("finishes before a connect callback publishes the next gesture target", () => {
    const onConnectionTargetChange = jest.fn();
    const onConnectionTargetChangeRef = { current: onConnectionTargetChange };
    const onConnectNodesRef = {
      current: jest.fn(() => {
        const nextGesture = createNodeConnectionGesture({
          sourceNodeId: 1,
          nodesRef: { current: [source, target] },
          onConnectNodesRef: { current: jest.fn() },
          onConnectionTargetChangeRef,
        });
        nextGesture?.move(pointer(220, 60));
      }),
    };
    const gesture = createNodeConnectionGesture({
      sourceNodeId: 1,
      nodesRef: { current: [source, target] },
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    });

    gesture?.move(pointer(220, 60));
    gesture?.end(pointer(220, 60));

    expect(onConnectionTargetChange.mock.calls).toEqual([[2], [null], [2]]);
  });

  it("remains finished when the connect callback throws", () => {
    const onConnectNodesRef = {
      current: jest.fn(() => {
        throw new Error("connect failed");
      }),
    };
    const onConnectionTargetChangeRef = { current: jest.fn() };
    const gesture = createNodeConnectionGesture({
      sourceNodeId: 1,
      nodesRef: { current: [source, target] },
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    });
    gesture?.move(pointer(220, 60));

    expect(() => gesture?.end(pointer(220, 60))).toThrow("connect failed");
    expect(() => gesture?.end(pointer(220, 60))).not.toThrow();
    expect(onConnectNodesRef.current).toHaveBeenCalledTimes(1);
    expect(onConnectionTargetChangeRef.current.mock.calls).toEqual([[2], [null]]);
  });
});
