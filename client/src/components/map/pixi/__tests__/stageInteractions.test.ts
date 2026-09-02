import { createStageInteractions } from "@/components/map/pixi/stageInteractions";
import type { Node } from "@/types/node";

type PointerEvent = {
  globalX: number;
  globalY: number;
  target?: unknown;
};

type Handler = (event: PointerEvent) => void;

type FakeStage = {
  on: jest.Mock;
  off: jest.Mock;
};

function pointer(globalX: number, globalY: number, target?: unknown): PointerEvent {
  return { globalX, globalY, target };
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

function createController(overrides: Partial<{
  nodes: readonly Node[];
  onSelectNode: (id: number | null) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  dragThreshold: number;
}> = {}) {
  const nodesRef = { current: overrides.nodes ?? [node] };
  const onSelectNodeRef = { current: overrides.onSelectNode ?? jest.fn() };
  const onMoveNodeRef = { current: overrides.onMoveNode ?? jest.fn() };
  const controller = createStageInteractions({
    nodesRef,
    onSelectNodeRef,
    onMoveNodeRef,
    dragThreshold: overrides.dragThreshold,
  });

  return { controller, nodesRef, onSelectNodeRef, onMoveNodeRef };
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

  it("uses the latest node position captured when the drag starts", () => {
    const { stage, handlers } = createStage();
    const { controller, nodesRef, onMoveNodeRef } = createController();
    controller.bind(stage as never);
    nodesRef.current = [{ ...node, x: 200, y: 300 }];

    controller.handleNodePointerDown(1, pointer(100, 60) as never);
    handlers.pointermove?.(pointer(104, 64));

    expect(onMoveNodeRef.current).toHaveBeenCalledWith(1, 204, 304);
  });

  it("does not move until either pointer delta reaches the four-pixel threshold", () => {
    const { stage, handlers } = createStage();
    const { controller, onMoveNodeRef } = createController();
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(100, 60) as never);
    handlers.pointermove?.(pointer(103, 63));

    expect(onMoveNodeRef.current).not.toHaveBeenCalled();
  });

  it("moves when either pointer delta reaches four pixels and preserves displacement", () => {
    const { stage, handlers } = createStage();
    const { controller, onMoveNodeRef } = createController();
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(100, 60) as never);
    handlers.pointermove?.(pointer(104, 61));
    handlers.pointermove?.(pointer(110, 66));

    expect(onMoveNodeRef.current).toHaveBeenNthCalledWith(1, 1, 24, 41);
    expect(onMoveNodeRef.current).toHaveBeenNthCalledWith(2, 1, 30, 46);
  });

  it("uses the latest move callback when dispatching a drag", () => {
    const { stage, handlers } = createStage();
    const { controller, onMoveNodeRef } = createController();
    controller.bind(stage as never);
    const latestOnMoveNode = jest.fn();
    onMoveNodeRef.current = latestOnMoveNode;

    controller.handleNodePointerDown(1, pointer(100, 60) as never);
    handlers.pointermove?.(pointer(104, 64));

    expect(latestOnMoveNode).toHaveBeenCalledWith(1, 24, 44);
  });

  it("selects a missing node and cancels any existing drag", () => {
    const { stage, handlers } = createStage();
    const { controller, nodesRef, onSelectNodeRef, onMoveNodeRef } = createController();
    controller.bind(stage as never);

    controller.handleNodePointerDown(1, pointer(100, 60) as never);
    nodesRef.current = [];
    controller.handleNodePointerDown(1, pointer(100, 60) as never);
    handlers.pointermove?.(pointer(120, 80));

    expect(onSelectNodeRef.current).toHaveBeenCalledWith(1);
    expect(onMoveNodeRef.current).not.toHaveBeenCalled();
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
