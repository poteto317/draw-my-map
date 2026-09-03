import { act, renderHook } from "@testing-library/react";
import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";
import { useMapStageInteractions } from "@/components/map/useMapStageInteractions";
import type { Node } from "@/types/node";

type StageEvent = "pointerdown" | "pointermove" | "pointerup" | "pointerupoutside" | "pointercancel";
type PointerEvent = {
  globalX: number;
  globalY: number;
  pointerId: number;
  pointerType: string;
  composedPath: () => unknown[];
  target?: unknown;
  shiftKey?: boolean;
};
type Handler = (event: PointerEvent) => void;
type Stage = {
  eventMode: string;
  hitArea: unknown;
  on: (name: StageEvent, handler: Handler) => Stage;
  off: (name: StageEvent, handler: Handler) => Stage;
};

function createRuntime() {
  const handlers: Partial<Record<StageEvent, Handler>> = {};
  const stage: Stage = {
    eventMode: "none",
    hitArea: null as unknown,
    on: jest.fn((name: StageEvent, handler: Handler) => {
      handlers[name] = handler;
      return stage;
    }),
    off: jest.fn((name: StageEvent, handler: Handler) => {
      if (handlers[name] === handler) delete handlers[name];
      return stage;
    }),
  };
  const runtime = {
    app: { stage, screen: { x: 0, y: 0, width: 800, height: 600 } },
    constructors: {},
  };
  return { runtime, stage, handlers };
}

type Runtime = ReturnType<typeof createRuntime>["runtime"];

function pointer(
  globalX: number,
  globalY: number,
  options: Pick<PointerEvent, "shiftKey" | "target"> & { path?: unknown[] } = {},
): PointerEvent {
  const { path = [], ...eventOptions } = options;
  return {
    globalX,
    globalY,
    pointerId: 1,
    pointerType: "mouse",
    composedPath: () => path,
    ...eventOptions,
  };
}

const nodes: Node[] = [
  { id: 1, parentId: null, x: 20, y: 40, width: 100, height: 60, label: "親" },
  { id: 2, parentId: null, x: 200, y: 40, width: 100, height: 60, label: "子" },
];

describe("useMapStageInteractions", () => {
  it("binds and removes stage listeners with the runtime lifecycle", () => {
    const { runtime, stage } = createRuntime();
    const viewportRef = { current: INITIAL_VIEWPORT };
    const { unmount } = renderHook(() =>
      useMapStageInteractions({
        runtime: runtime as never,
        nodes,
        viewportRef,
        onViewportChange: jest.fn(),
        onSelectNode: jest.fn(),
        onMoveNode: jest.fn(),
        onConnectNodes: jest.fn(),
      }),
    );

    expect(stage.eventMode).toBe("static");
    expect(stage.hitArea).toBe(runtime.app.screen);
    expect(stage.on).toHaveBeenCalledTimes(5);

    unmount();

    expect(stage.off).toHaveBeenCalledTimes(5);
  });

  it("publishes and clears the connection target", () => {
    const { runtime, stage, handlers } = createRuntime();
    const onConnectNodes = jest.fn();
    const viewportRef = { current: INITIAL_VIEWPORT };
    const { result } = renderHook(() =>
      useMapStageInteractions({
        runtime: runtime as never,
        nodes,
        viewportRef,
        onViewportChange: jest.fn(),
        onSelectNode: jest.fn(),
        onMoveNode: jest.fn(),
        onConnectNodes,
      }),
    );

    act(() => {
      result.current.onNodePointerDown(
        1,
        pointer(50, 50, { shiftKey: true, path: [stage] }) as never,
      );
      handlers.pointermove?.(pointer(220, 60));
    });
    expect(result.current.connectionTargetNodeId).toBe(2);

    act(() => handlers.pointerup?.(pointer(220, 60)));

    expect(onConnectNodes).toHaveBeenCalledWith(1, 2);
    expect(result.current.connectionTargetNodeId).toBeNull();
  });

  it("waits to bind stage listeners until a runtime is available", () => {
    const { runtime, stage } = createRuntime();
    const viewportRef = { current: INITIAL_VIEWPORT };
    const { result, rerender } = renderHook<
      ReturnType<typeof useMapStageInteractions>,
      { runtime: Runtime | null }
    >(
      ({ runtime: currentRuntime }) =>
        useMapStageInteractions({
          runtime: currentRuntime as never,
          nodes,
          viewportRef,
          onViewportChange: jest.fn(),
          onSelectNode: jest.fn(),
          onMoveNode: jest.fn(),
          onConnectNodes: jest.fn(),
        }),
      { initialProps: { runtime: null } },
    );

    expect(stage.on).not.toHaveBeenCalled();
    expect(result.current.connectionTargetNodeId).toBeNull();

    rerender({ runtime });

    expect(stage.on).toHaveBeenCalledTimes(5);
  });

  it("clears the connection target when the runtime is cleaned up", () => {
    const initial = createRuntime();
    const viewportRef = { current: INITIAL_VIEWPORT };
    const { result, rerender } = renderHook<
      ReturnType<typeof useMapStageInteractions>,
      { runtime: Runtime | null }
    >(
      ({ runtime }) =>
        useMapStageInteractions({
          runtime: runtime as never,
          nodes,
          viewportRef,
          onViewportChange: jest.fn(),
          onSelectNode: jest.fn(),
          onMoveNode: jest.fn(),
          onConnectNodes: jest.fn(),
        }),
      { initialProps: { runtime: initial.runtime } },
    );

    act(() => {
      result.current.onNodePointerDown(
        1,
        pointer(50, 50, { shiftKey: true, path: [initial.stage] }) as never,
      );
      initial.handlers.pointermove?.(pointer(220, 60));
    });
    expect(result.current.connectionTargetNodeId).toBe(2);

    rerender({ runtime: null });

    expect(result.current.connectionTargetNodeId).toBeNull();
  });
});
