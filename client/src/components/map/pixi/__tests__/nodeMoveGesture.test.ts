import { createNodeMoveGesture } from "@/components/map/pixi/nodeMoveGesture";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";

const node: Node = createTestNode({
  id: 1,
  parentId: null,
  x: 20,
  y: 40,
  width: 100,
  height: 60,
  label: "Node",
});

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

function createLease(): MapHistoryGroupLease {
  return { isActive: () => true, finish: () => {} };
}

function createHistorySpy() {
  let active = true;
  const lease = {
    isActive: jest.fn(() => active),
    finish: jest.fn(),
  };
  const onBeginNodeMove = jest.fn(() => lease);
  return {
    lease,
    onBeginNodeMove,
    expire: () => {
      active = false;
    },
  };
}

function createGestureWithHistory(startSample = pointer(100, 60), nodes: readonly Node[] = [node]) {
  const onMoveNode = jest.fn();
  const history = createHistorySpy();
  const gesture = createNodeMoveGesture({
    nodeId: 1,
    startSample,
    nodesRef: { current: nodes },
    onMoveNodeRef: { current: onMoveNode },
    onBeginNodeMoveRef: { current: history.onBeginNodeMove },
    dragThreshold: 4,
  });
  return { gesture, onMoveNode, ...history };
}

describe("createNodeMoveGesture", () => {
  it("returns null when the source node is missing", () => {
    expect(createNodeMoveGesture({
      nodeId: 1,
      startSample: pointer(100, 60),
      nodesRef: { current: [] },
      onMoveNodeRef: { current: jest.fn() },
      onBeginNodeMoveRef: { current: createLease },
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
      onBeginNodeMoveRef: { current: createLease },
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
      onBeginNodeMoveRef: { current: createLease },
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
      onBeginNodeMoveRef: { current: createLease },
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
      onBeginNodeMoveRef: { current: createLease },
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
      onBeginNodeMoveRef: { current: createLease },
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
      onBeginNodeMoveRef: { current: createLease },
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
      onBeginNodeMoveRef: { current: createLease },
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
        onBeginNodeMoveRef: { current: createLease },
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

  describe("移動履歴のグループ", () => {
    it("閾値未満の移動ではグループを開始しない", () => {
      const { gesture, onBeginNodeMove, lease } = createGestureWithHistory();

      gesture?.move(pointer(103, 63));
      gesture?.end(pointer(103, 63));

      expect(onBeginNodeMove).not.toHaveBeenCalled();
      expect(lease.finish).not.toHaveBeenCalled();
    });

    it("最初の有効な移動の直前に一度だけグループを開始する", () => {
      const { gesture, onBeginNodeMove, onMoveNode } = createGestureWithHistory();

      gesture?.move(pointer(104, 61));
      gesture?.move(pointer(110, 66));

      expect(onBeginNodeMove).toHaveBeenCalledTimes(1);
      expect(onBeginNodeMove.mock.invocationCallOrder[0])
        .toBeLessThan(onMoveNode.mock.invocationCallOrder[0]);
    });

    it("10回移動した後のendでグループを一度だけ終了する", () => {
      const { gesture, onBeginNodeMove, onMoveNode, lease } = createGestureWithHistory();

      for (let step = 1; step <= 10; step += 1) {
        gesture?.move(pointer(100 + step * 4, 60));
      }
      expect(lease.finish).not.toHaveBeenCalled();
      gesture?.end(pointer(140, 60));

      expect(onMoveNode).toHaveBeenCalledTimes(10);
      expect(onBeginNodeMove).toHaveBeenCalledTimes(1);
      expect(lease.finish).toHaveBeenCalledTimes(1);
    });

    it("cancelでもグループを一度だけ終了する", () => {
      const { gesture, lease } = createGestureWithHistory();

      gesture?.move(pointer(110, 60));
      gesture?.cancel();

      expect(lease.finish).toHaveBeenCalledTimes(1);
    });

    it("end後のcancelではグループを重ねて終了しない", () => {
      const { gesture, lease } = createGestureWithHistory();

      gesture?.move(pointer(110, 60));
      gesture?.end(pointer(110, 60));
      gesture?.cancel();
      gesture?.end(pointer(110, 60));

      expect(lease.finish).toHaveBeenCalledTimes(1);
    });

    it.each([
      pointer(Number.NaN, 64),
      pointer(104, 64, Number.POSITIVE_INFINITY, 64),
    ])("非有限の座標だけではグループを開始しない", (currentSample) => {
      const { gesture, onBeginNodeMove, lease } = createGestureWithHistory();

      gesture?.move(currentSample);
      gesture?.end(pointer(100, 60));

      expect(onBeginNodeMove).not.toHaveBeenCalled();
      expect(lease.finish).not.toHaveBeenCalled();
    });

    it("overflowする移動だけではグループを開始しない", () => {
      const { gesture, onBeginNodeMove } = createGestureWithHistory(
        pointer(0, 0),
        [{ ...node, x: Number.MAX_VALUE }],
      );

      gesture?.move(pointer(4, 0, Number.MAX_VALUE, 0));

      expect(onBeginNodeMove).not.toHaveBeenCalled();
    });

    it("クリックだけではグループを開始しない", () => {
      const { gesture, onBeginNodeMove, lease } = createGestureWithHistory();

      gesture?.end(pointer(100, 60));

      expect(onBeginNodeMove).not.toHaveBeenCalled();
      expect(lease.finish).not.toHaveBeenCalled();
    });

    it("グループが失効した後の移動は通知せず、再開もしない", () => {
      const { gesture, onBeginNodeMove, onMoveNode, lease, expire } = createGestureWithHistory();

      gesture?.move(pointer(104, 60));
      expire();
      gesture?.move(pointer(110, 60));
      gesture?.move(pointer(120, 60));
      gesture?.end(pointer(120, 60));

      expect(onMoveNode).toHaveBeenCalledTimes(1);
      expect(onBeginNodeMove).toHaveBeenCalledTimes(1);
      expect(lease.finish).toHaveBeenCalledTimes(1);
    });

    it("最新のグループ開始callbackを使う", () => {
      const initial = jest.fn(createLease);
      const latest = jest.fn(createLease);
      const onBeginNodeMoveRef = { current: initial };
      const gesture = createNodeMoveGesture({
        nodeId: 1,
        startSample: pointer(100, 60),
        nodesRef: { current: [node] },
        onMoveNodeRef: { current: jest.fn() },
        onBeginNodeMoveRef,
        dragThreshold: 4,
      });
      onBeginNodeMoveRef.current = latest;

      gesture?.move(pointer(110, 60));

      expect(initial).not.toHaveBeenCalled();
      expect(latest).toHaveBeenCalledTimes(1);
    });
  });
});
