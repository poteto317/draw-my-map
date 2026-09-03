import { createStageInteractions } from "@/components/map/pixi/stageInteractions";
import type { Node } from "@/types/node";

type PointerEvent = {
  globalX: number;
  globalY: number;
  target?: unknown;
  shiftKey?: boolean;
};

type Handler = (event: PointerEvent) => void;

type FakeStage = {
  on: jest.Mock;
  off: jest.Mock;
};

function pointer(
  globalX: number,
  globalY: number,
  target?: unknown,
  shiftKey = false,
): PointerEvent {
  return { globalX, globalY, target, shiftKey };
}

function createStage() {
  const handlers: Partial<Record<"pointerdown" | "pointermove" | "pointerup" | "pointerupoutside", Handler>> = {};
  const stage: FakeStage = {
    on: jest.fn((event: keyof typeof handlers, handler: Handler): FakeStage => {
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

function createController(overrides: Partial<{
  nodes: readonly Node[];
  onSelectNode: (id: number | null) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onConnectNodes: (parentId: number, childId: number) => boolean;
  onConnectionTargetChange: (id: number | null) => void;
  dragThreshold: number;
}> = {}) {
  const nodesRef = { current: overrides.nodes ?? [node] };
  const onSelectNodeRef = { current: overrides.onSelectNode ?? jest.fn() };
  const onMoveNodeRef = { current: overrides.onMoveNode ?? jest.fn() };
  const onConnectNodesRef = { current: overrides.onConnectNodes ?? jest.fn(() => true) };
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
    const { controller, onSelectNodeRef } = createController();
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

  it("selects a missing node without retaining gesture side effects", () => {
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

    expect(onSelectNodeRef.current).toHaveBeenCalledWith(1);
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
});
