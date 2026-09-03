import { createStageInteractions } from "@/components/map/pixi/stageInteractions";
import type { Node } from "@/types/node";

type PointerEvent = {
  globalX: number;
  globalY: number;
  pointerId: number;
  composedPath: () => unknown[];
  target?: unknown;
  shiftKey?: boolean;
};

type Handler = (event: PointerEvent) => void;

type FakeStage = {
  on: jest.Mock;
  off: jest.Mock;
};

let boundStageForPointer: FakeStage | null = null;

function pointer(
  globalX: number,
  globalY: number,
  target?: unknown,
  shiftKey = false,
  pointerId = 1,
  path?: unknown[],
): PointerEvent {
  const eventPath = path ?? (boundStageForPointer === null ? [] : [boundStageForPointer]);
  return { globalX, globalY, pointerId, target, shiftKey, composedPath: () => eventPath };
}

function createStage() {
  const handlers: Partial<Record<"pointerdown" | "pointermove" | "pointerup" | "pointerupoutside", Handler>> = {};
  const stage: FakeStage = {
    on: jest.fn((event: keyof typeof handlers, handler: Handler): FakeStage => {
      boundStageForPointer = stage;
      handlers[event] = handler;
      return stage;
    }),
    off: jest.fn((event: keyof typeof handlers, handler: Handler): FakeStage => {
      if (handlers[event] === handler) delete handlers[event];
      return stage;
    }),
  };

  return { stage, handlers };
}

const node: Node = {
  id: 1,
  parentId: null,
  x: 20,
  y: 40,
  width: 100,
  height: 60,
  label: "Node",
};

const targetNode: Node = {
  ...node,
  id: 2,
  x: 200,
};

beforeEach(() => {
  boundStageForPointer = null;
});

function createController(overrides: Partial<{
  nodes: readonly Node[];
  onSelectNode: (id: number | null) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onConnectNodes: (parentId: number, childId: number) => void;
  onConnectionTargetChange: (id: number | null) => void;
  dragThreshold: number;
}> = {}) {
  const nodesRef = { current: overrides.nodes ?? [node] };
  const onSelectNodeRef = { current: overrides.onSelectNode ?? jest.fn() };
  const onMoveNodeRef = { current: overrides.onMoveNode ?? jest.fn() };
  const onConnectNodesRef = {
    current: overrides.onConnectNodes ?? jest.fn<void, [number, number]>(),
  };
  const onConnectionTargetChangeRef = {
    current: overrides.onConnectionTargetChange ?? jest.fn(),
  };
  const controller = createStageInteractions({
    nodesRef,
    onSelectNodeRef,
    onMoveNodeRef,
    onConnectNodesRef,
    onConnectionTargetChangeRef,
    dragThreshold: overrides.dragThreshold,
  });

  return {
    controller,
    nodesRef,
    onSelectNodeRef,
    onMoveNodeRef,
    onConnectNodesRef,
    onConnectionTargetChangeRef,
  };
}

describe("createStageInteractions", () => {
  it("clears selection only for a pointerdown targeted directly at the stage", () => {
    const { stage, handlers } = createStage();
    const { controller, onSelectNodeRef } = createController();
    controller.bind(stage as never);
    const latestOnSelectNode = jest.fn();
    onSelectNodeRef.current = latestOnSelectNode;

    handlers.pointerdown?.(pointer(0, 0, {}));
    handlers.pointerdown?.(pointer(0, 0, stage));

    expect(latestOnSelectNode).toHaveBeenCalledTimes(1);
    expect(latestOnSelectNode).toHaveBeenCalledWith(null);
  });

  it("selects a node using the latest selection callback", () => {
    const { stage } = createStage();
    const { controller, onSelectNodeRef } = createController();
    controller.bind(stage as never);
    const latestOnSelectNode = jest.fn();
    onSelectNodeRef.current = latestOnSelectNode;

    controller.handleNodePointerDown(1, pointer(100, 60) as never);

    expect(latestOnSelectNode).toHaveBeenCalledWith(1);
  });

  it("routes a non-Shift gesture to node movement", () => {
    const { stage, handlers } = createStage();
    const { controller, onMoveNodeRef, onConnectNodesRef } = createController();
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(100, 60) as never);
    handlers.pointermove?.(pointer(108, 66));

    expect(onMoveNodeRef.current).toHaveBeenCalledWith(1, 28, 46);
    expect(onConnectNodesRef.current).not.toHaveBeenCalled();
  });

  it("cancels the active gesture without selecting a node missing from the latest snapshot", () => {
    const { stage, handlers } = createStage();
    const {
      controller,
      nodesRef,
      onSelectNodeRef,
      onMoveNodeRef,
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    } = createController();
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(100, 60) as never);
    nodesRef.current = [];
    controller.handleNodePointerDown(1, pointer(100, 60) as never);
    handlers.pointermove?.(pointer(120, 80));
    handlers.pointerup?.(pointer(120, 80));

    expect((onSelectNodeRef.current as jest.Mock).mock.calls).toEqual([[1]]);
    expect(onMoveNodeRef.current).not.toHaveBeenCalled();
    expect(onConnectNodesRef.current).not.toHaveBeenCalled();
    expect(onConnectionTargetChangeRef.current).not.toHaveBeenCalled();
  });

  it.each(["pointerup", "pointerupoutside"] as const)("stops dragging on %s", (eventName) => {
    const { stage, handlers } = createStage();
    const { controller, onMoveNodeRef } = createController();
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(100, 60) as never);
    handlers[eventName]?.(pointer(100, 60));
    handlers.pointermove?.(pointer(110, 70));

    expect(onMoveNodeRef.current).not.toHaveBeenCalled();
  });

  it("routes a Shift gesture to connection without moving the node", () => {
    const { stage, handlers } = createStage();
    const {
      controller,
      onMoveNodeRef,
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    } = createController({ nodes: [node, targetNode] });
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, true) as never);
    handlers.pointermove?.(pointer(220, 60));
    handlers.pointerup?.(pointer(220, 60));

    expect(onMoveNodeRef.current).not.toHaveBeenCalled();
    expect(onConnectionTargetChangeRef.current).toHaveBeenNthCalledWith(1, 2);
    expect(onConnectNodesRef.current).toHaveBeenCalledWith(1, 2);
    expect(onConnectionTargetChangeRef.current).toHaveBeenLastCalledWith(null);
  });

  it("cancels a connection on pointerupoutside and ignores later movement", () => {
    const { stage, handlers } = createStage();
    const {
      controller,
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    } = createController({ nodes: [node, targetNode] });
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, true) as never);
    handlers.pointermove?.(pointer(220, 60));
    handlers.pointerupoutside?.(pointer(220, 60));
    handlers.pointermove?.(pointer(220, 60));

    expect(onConnectNodesRef.current).not.toHaveBeenCalled();
    expect(onConnectionTargetChangeRef.current).toHaveBeenCalledTimes(2);
    expect(onConnectionTargetChangeRef.current).toHaveBeenNthCalledWith(1, 2);
    expect(onConnectionTargetChangeRef.current).toHaveBeenLastCalledWith(null);
  });

  it("ignores blank-stage, move, and pointerup events from a different pointer", () => {
    const { stage, handlers } = createStage();
    const {
      controller,
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    } = createController({ nodes: [node, targetNode] });
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, true, 1) as never);
    handlers.pointerdown?.(pointer(0, 0, stage, false, 2));
    handlers.pointermove?.(pointer(220, 60, undefined, false, 2));
    handlers.pointerup?.(pointer(220, 60, undefined, false, 2));

    expect(onConnectionTargetChangeRef.current).not.toHaveBeenCalled();
    expect(onConnectNodesRef.current).not.toHaveBeenCalled();

    handlers.pointermove?.(pointer(220, 60, undefined, false, 1));
    handlers.pointerup?.(pointer(220, 60, undefined, false, 1));

    expect((onConnectionTargetChangeRef.current as jest.Mock).mock.calls).toEqual([[2], [null]]);
    expect(onConnectNodesRef.current).toHaveBeenCalledWith(1, 2);
  });

  it("ignores pointerupoutside from a different pointer", () => {
    const { stage, handlers } = createStage();
    const {
      controller,
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    } = createController({ nodes: [node, targetNode] });
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, true, 1) as never);
    handlers.pointermove?.(pointer(220, 60, undefined, false, 1));
    handlers.pointerupoutside?.(pointer(220, 60, undefined, false, 2));
    handlers.pointerup?.(pointer(220, 60, undefined, false, 1));

    expect((onConnectionTargetChangeRef.current as jest.Mock).mock.calls).toEqual([[2], [null]]);
    expect(onConnectNodesRef.current).toHaveBeenCalledWith(1, 2);
  });

  it("cancels the active gesture when its pointer starts again on the blank stage", () => {
    const { stage, handlers } = createStage();
    const {
      controller,
      onSelectNodeRef,
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    } = createController({ nodes: [node, targetNode] });
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, true, 1) as never);
    handlers.pointermove?.(pointer(220, 60, undefined, false, 1));
    handlers.pointerdown?.(pointer(0, 0, stage, false, 1));
    handlers.pointerup?.(pointer(220, 60, undefined, false, 1));

    expect((onSelectNodeRef.current as jest.Mock).mock.calls).toEqual([[1], [null]]);
    expect((onConnectionTargetChangeRef.current as jest.Mock).mock.calls).toEqual([[2], [null]]);
    expect(onConnectNodesRef.current).not.toHaveBeenCalled();
  });

  it("preserves a gesture started synchronously from the previous gesture cancel callback", () => {
    const { stage, handlers } = createStage();
    const onMoveNode = jest.fn();
    const { controller, onConnectionTargetChangeRef } = createController({
      nodes: [node, targetNode],
      onMoveNode,
    });
    onConnectionTargetChangeRef.current = jest.fn((id: number | null) => {
      if (id === null) {
        controller.handleNodePointerDown(1, pointer(50, 50, undefined, false, 2) as never);
      }
    });
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, true, 1) as never);
    handlers.pointermove?.(pointer(220, 60, undefined, false, 1));
    handlers.pointerdown?.(pointer(0, 0, stage, false, 1));
    handlers.pointermove?.(pointer(60, 60, undefined, false, 2));

    expect(onMoveNode).toHaveBeenCalledWith(1, 30, 50);
  });

  it("preserves a gesture started from cancel while a node pointerdown replaces the old gesture", () => {
    const { stage, handlers } = createStage();
    const onMoveNode = jest.fn();
    let startedNextGesture = false;
    const { controller, onConnectionTargetChangeRef } = createController({
      nodes: [node, targetNode],
      onMoveNode,
    });
    onConnectionTargetChangeRef.current = jest.fn((id: number | null) => {
      if (id === null && !startedNextGesture) {
        startedNextGesture = true;
        controller.handleNodePointerDown(1, pointer(50, 50, undefined, false, 2) as never);
      }
    });
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, true, 1) as never);
    handlers.pointermove?.(pointer(220, 60, undefined, false, 1));
    controller.handleNodePointerDown(1, pointer(50, 50, undefined, false, 3) as never);
    handlers.pointermove?.(pointer(60, 60, undefined, false, 2));

    expect(onMoveNode).toHaveBeenCalledWith(1, 30, 50);
  });

  it("preserves a gesture started synchronously from the previous gesture end callback", () => {
    const { stage, handlers } = createStage();
    const onMoveNode = jest.fn();
    const { controller, onConnectNodesRef } = createController({
      nodes: [node, targetNode],
      onMoveNode,
    });
    onConnectNodesRef.current = jest.fn(() => {
      controller.handleNodePointerDown(1, pointer(50, 50, undefined, false, 2) as never);
    });
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, true, 1) as never);
    handlers.pointerup?.(pointer(220, 60, undefined, false, 1));
    handlers.pointermove?.(pointer(60, 60, undefined, false, 2));

    expect(onMoveNode).toHaveBeenCalledWith(1, 30, 50);
  });

  it("preserves a gesture started synchronously from the node selection callback", () => {
    const { stage, handlers } = createStage();
    const onMoveNode = jest.fn();
    let startedNextGesture = false;
    const { controller, onSelectNodeRef } = createController({ onMoveNode });
    onSelectNodeRef.current = jest.fn((id: number | null) => {
      if (id === 1 && !startedNextGesture) {
        startedNextGesture = true;
        controller.handleNodePointerDown(1, pointer(50, 50, undefined, false, 2) as never);
      }
    });
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, false, 1) as never);
    handlers.pointermove?.(pointer(60, 60, undefined, false, 2));

    expect(onMoveNode).toHaveBeenCalledWith(1, 30, 50);
  });

  it("preserves a gesture started synchronously from the blank selection callback", () => {
    const { stage, handlers } = createStage();
    const onMoveNode = jest.fn();
    const { controller, onSelectNodeRef } = createController({
      nodes: [node, targetNode],
      onMoveNode,
    });
    onSelectNodeRef.current = jest.fn((id: number | null) => {
      if (id === null) {
        controller.handleNodePointerDown(1, pointer(50, 50, undefined, false, 1) as never);
      }
    });
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, true, 1) as never);
    handlers.pointerdown?.(pointer(0, 0, stage, false, 1));
    handlers.pointermove?.(pointer(60, 60, undefined, false, 1));

    expect(onMoveNode).toHaveBeenCalledWith(1, 30, 50);
  });

  it("cancels the active connection before replacing it with a new pointerdown", () => {
    const { stage, handlers } = createStage();
    const onConnectionTargetChange = jest.fn();
    const { controller } = createController({
      nodes: [node, targetNode],
      onConnectionTargetChange,
    });
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, true) as never);
    handlers.pointermove?.(pointer(220, 60));
    controller.handleNodePointerDown(1, pointer(50, 50) as never);

    expect(onConnectionTargetChange.mock.calls).toEqual([[2], [null]]);
  });

  it("removes the same four listeners registered during binding", () => {
    const { stage, handlers } = createStage();
    const { controller } = createController();
    const cleanup = controller.bind(stage as never);
    const registeredHandlers = { ...handlers };

    cleanup();

    expect(stage.off).toHaveBeenCalledTimes(4);
    for (const eventName of ["pointerdown", "pointermove", "pointerup", "pointerupoutside"] as const) {
      expect(stage.off).toHaveBeenCalledWith(eventName, registeredHandlers[eventName]);
    }
  });

  it("removes every listener even when active gesture cancellation throws", () => {
    const { stage, handlers } = createStage();
    const onConnectionTargetChange = jest.fn((id: number | null) => {
      if (id === null) throw new Error("target cleanup failed");
    });
    const { controller } = createController({
      nodes: [node, targetNode],
      onConnectionTargetChange,
    });
    const cleanup = controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, true) as never);
    handlers.pointermove?.(pointer(220, 60));

    expect(cleanup).toThrow("target cleanup failed");
    expect(stage.off).toHaveBeenCalledTimes(4);
    expect(handlers).toEqual({});
  });

  it("does not carry a gesture started from cleanup into the next binding", () => {
    const first = createStage();
    const second = createStage();
    const onMoveNode = jest.fn();
    const { controller, onConnectionTargetChangeRef } = createController({
      nodes: [node, targetNode],
      onMoveNode,
    });
    onConnectionTargetChangeRef.current = jest.fn((id: number | null) => {
      if (id === null) {
        controller.handleNodePointerDown(1, pointer(50, 50, undefined, false, 2) as never);
      }
    });
    const cleanup = controller.bind(first.stage as never);

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, true, 1) as never);
    first.handlers.pointermove?.(pointer(220, 60, undefined, false, 1));
    cleanup();
    controller.bind(second.stage as never);
    second.handlers.pointermove?.(pointer(60, 60, undefined, false, 2));

    expect(onMoveNode).not.toHaveBeenCalled();

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, false, 3) as never);
    second.handlers.pointermove?.(pointer(60, 60, undefined, false, 3));

    expect(onMoveNode).toHaveBeenCalledWith(1, 30, 50);
  });

  it("rejects a second binding until the current binding is cleaned up", () => {
    const first = createStage();
    const second = createStage();
    const { controller } = createController();
    const cleanup = controller.bind(first.stage as never);

    expect(() => controller.bind(second.stage as never)).toThrow(
      "Stage interactions are already bound",
    );

    cleanup();

    expect(() => controller.bind(second.stage as never)).not.toThrow();
  });

  it("keeps a rebound gesture when an old cleanup function is called again", () => {
    const first = createStage();
    const second = createStage();
    const onMoveNode = jest.fn();
    const { controller } = createController({ onMoveNode });
    const cleanupFirst = controller.bind(first.stage as never);
    cleanupFirst();
    controller.bind(second.stage as never);

    controller.handleNodePointerDown(1, pointer(50, 50, undefined, false, 2) as never);
    cleanupFirst();
    second.handlers.pointermove?.(pointer(60, 60, undefined, false, 2));

    expect(onMoveNode).toHaveBeenCalledWith(1, 30, 50);
  });

  it("ignores a delayed node pointerdown from the previous stage binding", () => {
    const first = createStage();
    const second = createStage();
    const onMoveNode = jest.fn();
    const onSelectNode = jest.fn();
    const { controller } = createController({ onMoveNode, onSelectNode });
    const cleanupFirst = controller.bind(first.stage as never);
    const delayedFirstEvent = pointer(
      50,
      50,
      undefined,
      false,
      1,
      [first.stage],
    );
    cleanupFirst();
    controller.bind(second.stage as never);

    controller.handleNodePointerDown(1, pointer(
      50,
      50,
      undefined,
      false,
      2,
      [second.stage],
    ) as never);
    controller.handleNodePointerDown(1, delayedFirstEvent as never);
    second.handlers.pointermove?.(pointer(60, 60, undefined, false, 2));

    expect(onSelectNode.mock.calls).toEqual([[1]]);
    expect(onMoveNode).toHaveBeenCalledWith(1, 30, 50);
  });
});
