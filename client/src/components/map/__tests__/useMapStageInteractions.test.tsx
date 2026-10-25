import { act, renderHook } from "@testing-library/react";
import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";
import { useMapStageInteractions } from "@/components/map/useMapStageInteractions";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import { createTestNode } from "@/testing/createTestNode";
import { createTestMapHistoryLease as createLease } from "@/testing/createTestMapHistoryLease";

type StageEvent = "pointerdown" | "pointermove" | "pointerup" | "pointerupoutside" | "pointercancel";
type PointerEvent = {
  globalX: number;
  globalY: number;
  pointerId: number;
  pointerType: string;
  composedPath: () => unknown[];
  target?: unknown;
  shiftKey?: boolean;
  button: number;
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
    button: 0,
    composedPath: () => path,
    ...eventOptions,
  };
}

const nodes: Node[] = [
  createTestNode({ id: 1, x: 20, y: 40, label: "親" }),
  createTestNode({ id: 2, x: 200, y: 40, label: "子" }),
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
        onBeginNodeMove: createLease,
        onConnectNodes: jest.fn(),
        layoutMode: "manual",
        onReorderSibling: jest.fn(),
      }),
    );

    expect(stage.eventMode).toBe("static");
    expect(stage.hitArea).toBe(runtime.app.screen);
    expect(stage.on).toHaveBeenCalledTimes(5);

    unmount();

    expect(stage.off).toHaveBeenCalledTimes(5);
  });

  it("非表示ノードのpointerdownでは選択・移動・接続を開始しない", () => {
    const { runtime, stage } = createRuntime();
    const onSelectNode = jest.fn();
    const onMoveNode = jest.fn();
    const onConnectNodes = jest.fn();
    const viewportRef = { current: INITIAL_VIEWPORT };
    const { result } = renderHook(() =>
      useMapStageInteractions({
        runtime: runtime as never,
        nodes,
        visibleNodeIds: new Set([2]),
        viewportRef,
        onViewportChange: jest.fn(),
        onSelectNode,
        onMoveNode,
        onBeginNodeMove: createLease,
        onConnectNodes,
        layoutMode: "manual",
        onReorderSibling: jest.fn(),
      }),
    );

    act(() => result.current.createNodePointerDownHandler()(
      1,
      pointer(50, 50, { shiftKey: true, path: [stage] }) as never,
    ));

    expect(onSelectNode).not.toHaveBeenCalled();
    expect(onMoveNode).not.toHaveBeenCalled();
    expect(onConnectNodes).not.toHaveBeenCalled();
  });

  it("同じノードを含む別Setへのrerender後も進行中の移動を継続する", () => {
    const { runtime, stage, handlers } = createRuntime();
    const onMoveNode = jest.fn();
    const viewportRef = { current: INITIAL_VIEWPORT };
    const { result, rerender } = renderHook(
      ({ visibleNodeIds }: { visibleNodeIds: ReadonlySet<number> }) =>
        useMapStageInteractions({
          runtime: runtime as never,
          nodes,
          visibleNodeIds,
          viewportRef,
          onViewportChange: jest.fn(),
          onSelectNode: jest.fn(),
          onMoveNode,
          onBeginNodeMove: createLease,
          onConnectNodes: jest.fn(),
          layoutMode: "manual",
          onReorderSibling: jest.fn(),
        }),
      { initialProps: { visibleNodeIds: new Set([1, 2]) } },
    );

    act(() => {
      result.current.createNodePointerDownHandler()(1, pointer(50, 50, { path: [stage] }) as never);
      handlers.pointermove?.(pointer(70, 50));
    });
    rerender({ visibleNodeIds: new Set([1, 2]) });
    act(() => handlers.pointermove?.(pointer(90, 50)));

    expect(onMoveNode).toHaveBeenCalledTimes(2);
  });

  it("接続候補がhiddenになるとgestureをcancelし、pointerupで接続しない", () => {
    const { runtime, stage, handlers } = createRuntime();
    const onConnectNodes = jest.fn();
    const viewportRef = { current: INITIAL_VIEWPORT };
    const { result, rerender } = renderHook(
      ({ visibleNodeIds }: { visibleNodeIds: ReadonlySet<number> }) =>
        useMapStageInteractions({
          runtime: runtime as never,
          nodes,
          visibleNodeIds,
          viewportRef,
          onViewportChange: jest.fn(),
          onSelectNode: jest.fn(),
          onMoveNode: jest.fn(),
          onBeginNodeMove: createLease,
          onConnectNodes,
          layoutMode: "manual",
          onReorderSibling: jest.fn(),
        }),
      { initialProps: { visibleNodeIds: new Set([1, 2]) } },
    );

    act(() => {
      result.current.createNodePointerDownHandler()(1, pointer(50, 50, { shiftKey: true, path: [stage] }) as never);
      handlers.pointermove?.(pointer(220, 60));
    });
    expect(result.current.connectionTargetNodeId).toBe(2);

    rerender({ visibleNodeIds: new Set([1]) });
    expect(result.current.connectionTargetNodeId).toBeNull();
    act(() => handlers.pointerup?.(pointer(220, 60)));

    expect(onConnectNodes).not.toHaveBeenCalled();
  });

  it("接続元がhiddenになるとhighlightをclearしてpointerupで接続しない", () => {
    const { runtime, stage, handlers } = createRuntime();
    const onConnectNodes = jest.fn();
    const viewportRef = { current: INITIAL_VIEWPORT };
    const { result, rerender } = renderHook(
      ({ visibleNodeIds }: { visibleNodeIds: ReadonlySet<number> }) =>
        useMapStageInteractions({
          runtime: runtime as never,
          nodes,
          visibleNodeIds,
          viewportRef,
          onViewportChange: jest.fn(),
          onSelectNode: jest.fn(),
          onMoveNode: jest.fn(),
          onBeginNodeMove: createLease,
          onConnectNodes,
          layoutMode: "manual",
          onReorderSibling: jest.fn(),
        }),
      { initialProps: { visibleNodeIds: new Set([1, 2]) } },
    );

    act(() => {
      result.current.createNodePointerDownHandler()(
        1,
        pointer(50, 50, { shiftKey: true, path: [stage] }) as never,
      );
      handlers.pointermove?.(pointer(220, 60));
    });
    expect(result.current.connectionTargetNodeId).toBe(2);

    rerender({ visibleNodeIds: new Set([2]) });
    expect(result.current.connectionTargetNodeId).toBeNull();
    act(() => handlers.pointerup?.(pointer(220, 60)));

    expect(onConnectNodes).not.toHaveBeenCalled();
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
        onBeginNodeMove: createLease,
        onConnectNodes,
        layoutMode: "manual",
        onReorderSibling: jest.fn(),
      }),
    );

    act(() => {
      result.current.createNodePointerDownHandler()(
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
          onBeginNodeMove: createLease,
          onConnectNodes: jest.fn(),
          layoutMode: "manual",
          onReorderSibling: jest.fn(),
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
          onBeginNodeMove: createLease,
          onConnectNodes: jest.fn(),
          layoutMode: "manual",
          onReorderSibling: jest.fn(),
        }),
      { initialProps: { runtime: initial.runtime } },
    );

    act(() => {
      result.current.createNodePointerDownHandler()(
        1,
        pointer(50, 50, { shiftKey: true, path: [initial.stage] }) as never,
      );
      initial.handlers.pointermove?.(pointer(220, 60));
    });
    expect(result.current.connectionTargetNodeId).toBe(2);

    rerender({ runtime: null });

    expect(result.current.connectionTargetNodeId).toBeNull();
  });

  describe("兄弟の並べ替えのドラッグ", () => {
    // 縦に並んだ2つのルート。id 1 の中心は y 30、id 2 の中心は y 130
    const stackedRoots: Node[] = [
      createTestNode({ id: 1, parentId: null, x: 0, y: 0, label: "上" }),
      createTestNode({ id: 2, parentId: null, x: 0, y: 100, label: "下" }),
    ];

    it("自動配置ではドラッグの途中にプレビューを出し、離すとプレビューを消して並べ替えを要求する", () => {
      const { runtime, stage, handlers } = createRuntime();
      const onMoveNode = jest.fn();
      const onReorderSibling = jest.fn();
      const viewportRef = { current: INITIAL_VIEWPORT };
      const { result } = renderHook(() =>
        useMapStageInteractions({
          runtime: runtime as never,
          nodes: stackedRoots,
          viewportRef,
          onViewportChange: jest.fn(),
          onSelectNode: jest.fn(),
          onMoveNode,
          onBeginNodeMove: createLease,
          onConnectNodes: jest.fn(),
          layoutMode: "auto",
          onReorderSibling,
        }),
      );

      expect(result.current.siblingReorderPreview).toBeNull();
      act(() => {
        result.current.createNodePointerDownHandler()(1, pointer(50, 30, { path: [stage] }) as never);
      });
      expect(result.current.isSiblingReorderActive()).toBe(true);
      act(() => handlers.pointermove?.(pointer(50, 140)));

      expect(result.current.siblingReorderPreview).toEqual({
        nodeId: 1,
        indicator: { left: -8, right: 108, y: 180 },
      });

      act(() => handlers.pointerup?.(pointer(50, 140)));

      expect(result.current.siblingReorderPreview).toBeNull();
      expect(result.current.isSiblingReorderActive()).toBe(false);
      expect(onReorderSibling).toHaveBeenCalledWith(1, {
        kind: "drop",
        target: { position: "after", anchorId: 2 },
      });
      expect(onMoveNode).not.toHaveBeenCalled();
    });

    it("layoutModeをrerenderで変えると、次のジェスチャーから分岐が変わる", () => {
      const { runtime, stage, handlers } = createRuntime();
      const onMoveNode = jest.fn();
      const onReorderSibling = jest.fn();
      const viewportRef = { current: INITIAL_VIEWPORT };
      const { result, rerender } = renderHook(
        ({ layoutMode }: { layoutMode: NodeLayoutMode }) =>
          useMapStageInteractions({
            runtime: runtime as never,
            nodes: stackedRoots,
            viewportRef,
            onViewportChange: jest.fn(),
            onSelectNode: jest.fn(),
            onMoveNode,
            onBeginNodeMove: createLease,
            onConnectNodes: jest.fn(),
            layoutMode,
            onReorderSibling,
          }),
        { initialProps: { layoutMode: "manual" as NodeLayoutMode } },
      );
      const drag = () => {
        act(() => {
          result.current.createNodePointerDownHandler()(1, pointer(50, 30, { path: [stage] }) as never);
          handlers.pointermove?.(pointer(50, 140));
          handlers.pointerup?.(pointer(50, 140));
        });
      };

      drag();
      expect(onMoveNode).toHaveBeenCalledTimes(1);
      expect(onReorderSibling).not.toHaveBeenCalled();

      rerender({ layoutMode: "auto" });
      drag();
      expect(onMoveNode).toHaveBeenCalledTimes(1);
      expect(onReorderSibling).toHaveBeenCalledTimes(1);

      rerender({ layoutMode: "manual" });
      drag();
      expect(onMoveNode).toHaveBeenCalledTimes(2);
      expect(onReorderSibling).toHaveBeenCalledTimes(1);
    });
  });
});
