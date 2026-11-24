import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";
import type { Viewport } from "@/components/map/mapViewport";
import { createStageInteractions } from "@/components/map/pixi/stageInteractions";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import type { SiblingReorderPreview } from "@/components/map/siblingReorderDropSlot";
import type { SiblingReorderRequest } from "@/domain/nodes/nodeSiblingOrder";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import {
  createMapHistoryLeaseSpy as createMoveHistorySpy,
  createTestMapHistoryLease,
} from "@/testing/createTestMapHistoryLease";

type PointerEvent = {
  globalX: number;
  globalY: number;
  pointerId: number;
  pointerType: string;
  composedPath: () => unknown[];
  target?: unknown;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  button: number;
};

type Handler = (event: PointerEvent) => void;

type StageEvent = "pointerdown" | "pointermove" | "pointerup" | "pointerupoutside" | "pointercancel";

type FakeStage = {
  on: jest.Mock;
  off: jest.Mock;
};

let boundStageForPointer: FakeStage | null = null;

type PointerOptions = {
  target?: unknown;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  pointerId?: number;
  pointerType?: string;
  button?: number;
  path?: unknown[];
};

function pointer(
  globalX: number,
  globalY: number,
  options: PointerOptions = {},
): PointerEvent {
  const eventPath = options.path
    ?? (boundStageForPointer === null ? [] : [boundStageForPointer]);
  return {
    globalX,
    globalY,
    pointerId: options.pointerId ?? 1,
    pointerType: options.pointerType ?? "mouse",
    target: options.target,
    shiftKey: options.shiftKey ?? false,
    metaKey: options.metaKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    altKey: options.altKey ?? false,
    button: options.button ?? 0,
    composedPath: () => eventPath,
  };
}

function createStage() {
  const handlers: Partial<Record<StageEvent, Handler>> = {};
  const stage: FakeStage = {
    on: jest.fn((event: StageEvent, handler: Handler): FakeStage => {
      boundStageForPointer = stage;
      handlers[event] = handler;
      return stage;
    }),
    off: jest.fn((event: StageEvent, handler: Handler): FakeStage => {
      if (handlers[event] === handler) delete handlers[event];
      return stage;
    }),
  };

  return { stage, handlers };
}

const node: Node = createTestNode({
  id: 1,
  parentId: null,
  x: 20,
  y: 40,
  width: 100,
  height: 60,
  label: "Node",
});

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
  viewport: Viewport;
  onSelectNode: (id: number | null) => void;
  onToggleNodeSelection: (id: number) => void;
  onSelectNodeRange: (targetId: number, visibleOrdered: readonly number[]) => void;
  onClearSelection: () => void;
  onSetSelectionFromMarquee: (args: { mode: "replace" | "add"; ids: readonly number[] }) => void;
  onMarqueeRectChange: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onBeginNodeMove: () => MapHistoryGroupLease;
  onMovePinnedNode: (id: number, x: number, y: number) => void;
  onFinalizePinnedNodeMove: () => boolean;
  onConnectNodes: (parentId: number, childId: number) => void;
  onConnectionTargetChange: (id: number | null) => void;
  dragThreshold: number;
  visibleNodeIds: ReadonlySet<number>;
  layoutMode: NodeLayoutMode;
  onReorderSibling: (nodeId: number, request: SiblingReorderRequest) => void;
  onSiblingReorderPreviewChange: (preview: SiblingReorderPreview | null) => void;
  shouldIgnorePointerDown: () => boolean;
  isApplePlatform: () => boolean;
}> = {}) {
  const nodesRef = { current: overrides.nodes ?? [node] };
  const viewportRef = {
    current: overrides.viewport ?? INITIAL_VIEWPORT,
  };
  const onSelectNodeRef = { current: overrides.onSelectNode ?? jest.fn() };
  const onToggleNodeSelectionRef = {
    current: overrides.onToggleNodeSelection ?? jest.fn(),
  };
  const onSelectNodeRangeRef = {
    current: overrides.onSelectNodeRange ?? jest.fn(),
  };
  const onClearSelectionRef = {
    current: overrides.onClearSelection ?? jest.fn(),
  };
  const onSetSelectionFromMarqueeRef = {
    current: overrides.onSetSelectionFromMarquee ?? jest.fn(),
  };
  const onMarqueeRectChangeRef = {
    current: overrides.onMarqueeRectChange ?? jest.fn(),
  };
  const onMoveNodeRef = { current: overrides.onMoveNode ?? jest.fn() };
  const onBeginNodeMoveRef = {
    current: overrides.onBeginNodeMove
      ?? jest.fn(createTestMapHistoryLease),
  };
  const onMovePinnedNodeRef = {
    current: overrides.onMovePinnedNode,
  };
  const onFinalizePinnedNodeMoveRef = {
    current: overrides.onFinalizePinnedNodeMove,
  };
  const onConnectNodesRef = {
    current: overrides.onConnectNodes ?? jest.fn<void, [number, number]>(),
  };
  const onConnectionTargetChangeRef = {
    current: overrides.onConnectionTargetChange ?? jest.fn(),
  };
  const onViewportChangeRef = { current: jest.fn() };
  const layoutModeRef: { current: NodeLayoutMode } = { current: overrides.layoutMode ?? "manual" };
  const onReorderSiblingRef = {
    current: overrides.onReorderSibling ?? jest.fn<void, [number, SiblingReorderRequest]>(),
  };
  const onSiblingReorderPreviewChangeRef = {
    current: overrides.onSiblingReorderPreviewChange ?? jest.fn<void, [SiblingReorderPreview | null]>(),
  };
  const visibleNodeIdsRef = overrides.visibleNodeIds === undefined
    ? undefined
    : { current: overrides.visibleNodeIds };
  const isApplePlatformRef = {
    current: overrides.isApplePlatform ?? (() => true),
  };
  const controller = createStageInteractions({
    nodesRef,
    viewportRef,
    onSelectNodeRef,
    onToggleNodeSelectionRef,
    onSelectNodeRangeRef,
    onClearSelectionRef,
    onSetSelectionFromMarqueeRef,
    onMarqueeRectChangeRef,
    onMoveNodeRef,
    onBeginNodeMoveRef,
    onMovePinnedNodeRef,
    onFinalizePinnedNodeMoveRef,
    onConnectNodesRef,
    onConnectionTargetChangeRef,
    onViewportChangeRef,
    visibleNodeIdsRef,
    layoutModeRef,
    onReorderSiblingRef,
    onSiblingReorderPreviewChangeRef,
    shouldIgnorePointerDownRef: overrides.shouldIgnorePointerDown === undefined
      ? undefined
      : { current: overrides.shouldIgnorePointerDown },
    isApplePlatformRef,
    dragThreshold: overrides.dragThreshold,
  });

  return {
    controller,
    nodesRef,
    viewportRef,
    onSelectNodeRef,
    onToggleNodeSelectionRef,
    onSelectNodeRangeRef,
    onClearSelectionRef,
    onSetSelectionFromMarqueeRef,
    onMarqueeRectChangeRef,
    onMoveNodeRef,
    onBeginNodeMoveRef,
    onMovePinnedNodeRef,
    onFinalizePinnedNodeMoveRef,
    onConnectNodesRef,
    onConnectionTargetChangeRef,
    onViewportChangeRef,
    visibleNodeIdsRef,
    layoutModeRef,
    onReorderSiblingRef,
    onSiblingReorderPreviewChangeRef,
  };
}

function nodePointerDown(
  controller: ReturnType<typeof createStageInteractions>,
  nodeId: number,
  event: PointerEvent,
) {
  controller.createNodePointerDownHandler()(nodeId, event as never);
}

describe("createStageInteractions", () => {
  it("hidden nodeからgestureを開始しない", () => {
    const { stage } = createStage();
    const { controller, onSelectNodeRef } = createController({
      nodes: [node, targetNode],
      visibleNodeIds: new Set([targetNode.id]),
    });
    controller.bind(stage as never);
    nodePointerDown(controller, node.id, pointer(0, 0, { target: stage }) as never);

    expect(onSelectNodeRef.current).not.toHaveBeenCalled();
  });
  it("背景 pointerdown では clear せず、未 activated の pointerup で clear する", () => {
    const { stage, handlers } = createStage();
    const { controller, onClearSelectionRef, onSelectNodeRef } = createController();
    controller.bind(stage as never);
    const latestClear = jest.fn();
    onClearSelectionRef.current = latestClear;

    handlers.pointerdown?.(pointer(0, 0, { target: {} }));
    handlers.pointerdown?.(pointer(0, 0, { target: stage }));
    expect(latestClear).not.toHaveBeenCalled();
    expect(onSelectNodeRef.current).not.toHaveBeenCalled();

    handlers.pointerup?.(pointer(0, 0));
    expect(latestClear).toHaveBeenCalledTimes(1);
  });

  it.each([1, 2])("button %sでは空白選択解除やパンを開始しない", (button) => {
    const { stage, handlers } = createStage();
    const { controller, onSelectNodeRef, onViewportChangeRef } = createController();
    controller.bind(stage as never);

    handlers.pointerdown?.(pointer(0, 0, { target: stage, button }));
    handlers.pointermove?.(pointer(20, 20, { button }));

    expect(onSelectNodeRef.current).not.toHaveBeenCalled();
    expect(onViewportChangeRef.current).not.toHaveBeenCalled();
  });

  it.each([1, 2])("button %sではノード選択や移動を開始しない", (button) => {
    const { stage, handlers } = createStage();
    const { controller, onSelectNodeRef, onMoveNodeRef } = createController();
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(50, 50, { button }) as never);
    handlers.pointermove?.(pointer(70, 70, { button }));

    expect(onSelectNodeRef.current).not.toHaveBeenCalled();
    expect(onMoveNodeRef.current).not.toHaveBeenCalled();
  });

  it("閉じたオーバーレイの続きの押下は、空白の選択解除もパンも始めない", () => {
    const { stage, handlers } = createStage();
    const { controller, onSelectNodeRef, onViewportChangeRef } = createController({
      shouldIgnorePointerDown: () => true,
    });
    controller.bind(stage as never);

    handlers.pointerdown?.(pointer(0, 0, { target: stage }));
    handlers.pointermove?.(pointer(20, 20));

    expect(onSelectNodeRef.current).not.toHaveBeenCalled();
    expect(onViewportChangeRef.current).not.toHaveBeenCalled();
    expect(controller.hasActiveGesture()).toBe(false);
  });

  it("閉じたオーバーレイの続きの押下は、ノードの選択も移動も始めない", () => {
    const { stage, handlers } = createStage();
    const { controller, onSelectNodeRef, onMoveNodeRef } = createController({
      shouldIgnorePointerDown: () => true,
    });
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(50, 50) as never);
    handlers.pointermove?.(pointer(70, 70));

    expect(onSelectNodeRef.current).not.toHaveBeenCalled();
    expect(onMoveNodeRef.current).not.toHaveBeenCalled();
    expect(controller.hasActiveGesture()).toBe(false);
  });

  it("続きの押下でなければ、空白の選択解除とノードの選択を通常どおり行う", () => {
    const { stage, handlers } = createStage();
    const { controller, onSelectNodeRef, onClearSelectionRef } = createController({
      shouldIgnorePointerDown: () => false,
    });
    controller.bind(stage as never);

    handlers.pointerdown?.(pointer(0, 0, { target: stage }));
    handlers.pointerup?.(pointer(0, 0));
    nodePointerDown(controller, 1, pointer(50, 50) as never);

    expect(onClearSelectionRef.current).toHaveBeenCalledTimes(1);
    expect(onSelectNodeRef.current).toHaveBeenCalledWith(1);
  });

  it("selects a node using the latest selection callback", () => {
    const { stage } = createStage();
    const { controller, onSelectNodeRef } = createController();
    controller.bind(stage as never);
    const latestOnSelectNode = jest.fn();
    onSelectNodeRef.current = latestOnSelectNode;

    nodePointerDown(controller, 1, pointer(100, 60) as never);

    expect(latestOnSelectNode).toHaveBeenCalledWith(1);
  });

  it("ノード選択のcallbackが例外を投げたら、開始したgestureを片付けて例外を伝える", () => {
    const { stage, handlers } = createStage();
    const { controller, onSelectNodeRef, onMoveNodeRef } = createController();
    onSelectNodeRef.current = jest.fn(() => {
      throw new Error("select failed");
    });
    controller.bind(stage as never);

    expect(() => nodePointerDown(controller, 1, pointer(100, 60) as never)).toThrow("select failed");
    expect(controller.hasActiveGesture()).toBe(false);
    handlers.pointermove?.(pointer(140, 90));

    expect(onMoveNodeRef.current).not.toHaveBeenCalled();
  });

  it("activeNodeIdsは操作中のgestureのノードだけを返し、ノードを持たないパンや待機中は空", () => {
    const { stage, handlers } = createStage();
    const { controller } = createController();
    controller.bind(stage as never);

    expect(controller.activeNodeIds()).toEqual([]);
    nodePointerDown(controller, 1, pointer(100, 60) as never);
    expect(controller.activeNodeIds()).toEqual([1]);
    handlers.pointerup?.(pointer(100, 60));
    expect(controller.activeNodeIds()).toEqual([]);

    handlers.pointerdown?.(pointer(0, 0, { target: stage }));
    expect(controller.hasActiveGesture()).toBe(true);
    expect(controller.activeNodeIds()).toEqual([]);
  });

  it("routes a non-Shift gesture to node movement", () => {
    const { stage, handlers } = createStage();
    const { controller, onMoveNodeRef, onConnectNodesRef } = createController();
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(100, 60) as never);
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

    nodePointerDown(controller, 1, pointer(100, 60) as never);
    nodesRef.current = [];
    nodePointerDown(controller, 1, pointer(100, 60) as never);
    handlers.pointermove?.(pointer(120, 80));
    handlers.pointerup?.(pointer(120, 80));

    expect((onSelectNodeRef.current as jest.Mock).mock.calls).toEqual([[1]]);
    expect(onMoveNodeRef.current).not.toHaveBeenCalled();
    expect(onConnectNodesRef.current).not.toHaveBeenCalled();
    expect(onConnectionTargetChangeRef.current).not.toHaveBeenCalled();
  });

  it("別pointerの欠損ノード入力では所有中のgestureをキャンセルしない", () => {
    const { stage, handlers } = createStage();
    const { controller, nodesRef, onMoveNodeRef } = createController();
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(100, 60, { pointerId: 1 }) as never);
    nodesRef.current = [];
    nodePointerDown(controller, 999, pointer(50, 50, { pointerId: 2 }) as never);
    nodesRef.current = [node];
    handlers.pointermove?.(pointer(108, 66, { pointerId: 1 }));

    expect(onMoveNodeRef.current).toHaveBeenCalledWith(1, 28, 46);
  });

  it("欠損ノードのtouchを追跡せず次の有効なnode touchを通常gestureへ渡す", () => {
    const { stage } = createStage();
    const { controller, onSelectNodeRef } = createController();
    controller.bind(stage as never);

    nodePointerDown(controller, 999, pointer(50, 50, {
      pointerId: 1,
      pointerType: "touch",
      path: [stage],
    }) as never);
    nodePointerDown(controller, 1, pointer(50, 50, {
      pointerId: 2,
      pointerType: "touch",
      path: [stage],
    }) as never);

    expect(onSelectNodeRef.current).toHaveBeenCalledTimes(1);
    expect(onSelectNodeRef.current).toHaveBeenCalledWith(1);
  });

  it.each(["pointerup", "pointerupoutside"] as const)("stops dragging on %s", (eventName) => {
    const { stage, handlers } = createStage();
    const { controller, onMoveNodeRef } = createController();
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(100, 60) as never);
    handlers[eventName]?.(pointer(100, 60));
    handlers.pointermove?.(pointer(110, 70));

    expect(onMoveNodeRef.current).not.toHaveBeenCalled();
  });

  it.each(["pointerup", "pointerupoutside"] as const)(
    "最後に解放されたmouse buttonに関係なく所有pointerの%sでgestureを終了する",
    (eventName) => {
      const { stage, handlers } = createStage();
      const { controller, onMoveNodeRef } = createController();
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(100, 60) as never);
      handlers[eventName]?.(pointer(100, 60, { button: 2 }));
      handlers.pointermove?.(pointer(110, 70));

      expect(onMoveNodeRef.current).not.toHaveBeenCalled();
    },
  );

  it("routes a Shift gesture to connection without moving the node", () => {
    const { stage, handlers } = createStage();
    const {
      controller,
      onMoveNodeRef,
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    } = createController({ nodes: [node, targetNode] });
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(50, 50, { shiftKey: true }) as never);
    handlers.pointermove?.(pointer(220, 60));
    handlers.pointerup?.(pointer(220, 60));

    expect(onMoveNodeRef.current).not.toHaveBeenCalled();
    expect(onConnectionTargetChangeRef.current).toHaveBeenNthCalledWith(1, 2);
    expect(onConnectNodesRef.current).toHaveBeenCalledWith(1, 2);
    expect(onConnectionTargetChangeRef.current).toHaveBeenLastCalledWith(null);
  });

  it("hiddenになった接続候補をcancelするとhighlightをclearする", () => {
    const { stage, handlers } = createStage();
    const {
      controller,
      onConnectionTargetChangeRef,
      onConnectNodesRef,
      visibleNodeIdsRef,
    } = createController({ nodes: [node, targetNode], visibleNodeIds: new Set([1, 2]) });
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(50, 50, { shiftKey: true }) as never);
    handlers.pointermove?.(pointer(220, 60));
    expect(onConnectionTargetChangeRef.current).toHaveBeenCalledWith(2);

    visibleNodeIdsRef!.current = new Set([1]);
    controller.cancelActiveGesture();
    handlers.pointerup?.(pointer(220, 60));

    expect(onConnectionTargetChangeRef.current).toHaveBeenLastCalledWith(null);
    expect(onConnectNodesRef.current).not.toHaveBeenCalled();
  });

  it("hiddenの中間祖先を含む完全nodesで接続可否を判定する", () => {
    const { stage, handlers } = createStage();
    const source = { ...node, id: 3, parentId: 2 };
    const hiddenAncestor = { ...node, id: 2, parentId: 1, x: 350 };
    const target = { ...node, id: 1, parentId: null, x: 200 };
    const { controller, onConnectionTargetChangeRef, onConnectNodesRef } = createController({
      nodes: [source, hiddenAncestor, target],
      visibleNodeIds: new Set([source.id, target.id]),
    });
    controller.bind(stage as never);

    nodePointerDown(controller, source.id, pointer(50, 50, { shiftKey: true }) as never);
    handlers.pointermove?.(pointer(220, 60));
    handlers.pointerup?.(pointer(220, 60));

    expect(onConnectionTargetChangeRef.current).not.toHaveBeenCalledWith(target.id);
    expect(onConnectNodesRef.current).not.toHaveBeenCalled();
  });

  it("cancels a connection on pointerupoutside and ignores later movement", () => {
    const { stage, handlers } = createStage();
    const {
      controller,
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    } = createController({ nodes: [node, targetNode] });
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(50, 50, { shiftKey: true }) as never);
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
      onSelectNodeRef,
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    } = createController({ nodes: [node, targetNode] });
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(50, 50, { shiftKey: true, pointerId: 1 }) as never);
    handlers.pointerdown?.(pointer(0, 0, { target: stage, pointerId: 2 }));
    handlers.pointermove?.(pointer(220, 60, { pointerId: 2 }));
    handlers.pointerup?.(pointer(220, 60, { pointerId: 2 }));

    expect(onSelectNodeRef.current).not.toHaveBeenCalled();
    expect(onConnectionTargetChangeRef.current).not.toHaveBeenCalled();
    expect(onConnectNodesRef.current).not.toHaveBeenCalled();

    handlers.pointermove?.(pointer(220, 60, { pointerId: 1 }));
    handlers.pointerup?.(pointer(220, 60, { pointerId: 1 }));

    expect((onSelectNodeRef.current as jest.Mock).mock.calls).toEqual([[1]]);
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

    nodePointerDown(controller, 1, pointer(50, 50, { shiftKey: true, pointerId: 1 }) as never);
    handlers.pointermove?.(pointer(220, 60, { pointerId: 1 }));
    handlers.pointerupoutside?.(pointer(220, 60, { pointerId: 2 }));
    handlers.pointerup?.(pointer(220, 60, { pointerId: 1 }));

    expect((onConnectionTargetChangeRef.current as jest.Mock).mock.calls).toEqual([[2], [null]]);
    expect(onConnectNodesRef.current).toHaveBeenCalledWith(1, 2);
  });

  it("別pointerのpointercancelでは所有中のgestureを止めない", () => {
    const { stage, handlers } = createStage();
    const { controller } = createController();
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(100, 60, { pointerId: 1 }) as never);
    handlers.pointercancel?.(pointer(100, 60, { pointerId: 2 }));

    expect(controller.hasActiveGesture()).toBe(true);
  });

  it("cancels the active gesture when its pointer starts again on the blank stage", () => {
    const { stage, handlers } = createStage();
    const {
      controller,
      onSelectNodeRef,
      onClearSelectionRef,
      onConnectNodesRef,
      onConnectionTargetChangeRef,
    } = createController({ nodes: [node, targetNode] });
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(50, 50, { shiftKey: true, pointerId: 1 }) as never);
    handlers.pointermove?.(pointer(220, 60, { pointerId: 1 }));
    handlers.pointerdown?.(pointer(0, 0, { target: stage, pointerId: 1 }));
    handlers.pointerup?.(pointer(0, 0, { pointerId: 1 }));

    expect((onSelectNodeRef.current as jest.Mock).mock.calls).toEqual([[1]]);
    expect(onClearSelectionRef.current).toHaveBeenCalledTimes(1);
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
        nodePointerDown(controller, 1, pointer(50, 50, { pointerId: 2 }) as never);
      }
    });
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(50, 50, { shiftKey: true, pointerId: 1 }) as never);
    handlers.pointermove?.(pointer(220, 60, { pointerId: 1 }));
    handlers.pointerdown?.(pointer(0, 0, { target: stage, pointerId: 1 }));
    handlers.pointermove?.(pointer(60, 60, { pointerId: 2 }));

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
        nodePointerDown(controller, 1, pointer(50, 50, { pointerId: 2 }) as never);
      }
    });
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(50, 50, { shiftKey: true, pointerId: 1 }) as never);
    handlers.pointermove?.(pointer(220, 60, { pointerId: 1 }));
    nodePointerDown(controller, 1, pointer(50, 50, { pointerId: 3 }) as never);
    handlers.pointermove?.(pointer(60, 60, { pointerId: 2 }));

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
      nodePointerDown(controller, 1, pointer(50, 50, { pointerId: 2 }) as never);
    });
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(50, 50, { shiftKey: true, pointerId: 1 }) as never);
    handlers.pointermove?.(pointer(220, 60, { pointerId: 1 }));
    handlers.pointerup?.(pointer(220, 60, { pointerId: 1 }));
    handlers.pointermove?.(pointer(60, 60, { pointerId: 2 }));

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
        nodePointerDown(controller, 1, pointer(50, 50, { pointerId: 2 }) as never);
      }
    });
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(50, 50, { pointerId: 1 }) as never);
    handlers.pointermove?.(pointer(60, 60, { pointerId: 2 }));

    expect(onMoveNode).toHaveBeenCalledWith(1, 30, 50);
  });

  it("preserves a gesture started synchronously from the blank clear callback", () => {
    const { stage, handlers } = createStage();
    const onMoveNode = jest.fn();
    const { controller, onClearSelectionRef } = createController({
      nodes: [node, targetNode],
      onMoveNode,
    });
    onClearSelectionRef.current = jest.fn(() => {
      nodePointerDown(controller, 1, pointer(50, 50, { pointerId: 1 }) as never);
    });
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(50, 50, { shiftKey: true, pointerId: 1 }) as never);
    handlers.pointermove?.(pointer(220, 60, { pointerId: 1 }));
    handlers.pointerdown?.(pointer(0, 0, { target: stage, pointerId: 1 }));
    handlers.pointerup?.(pointer(0, 0, { pointerId: 1 }));
    handlers.pointermove?.(pointer(60, 60, { pointerId: 1 }));

    expect(onMoveNode).toHaveBeenCalledWith(1, 30, 50);
  });

  it("背景未activated終端のclearでbindingが解放されても残gestureを持たない", () => {
    const { stage, handlers } = createStage();
    const { controller, onClearSelectionRef } = createController();
    const cleanup = controller.bind(stage as never);
    onClearSelectionRef.current = jest.fn(() => { cleanup(); });

    handlers.pointerdown?.(pointer(0, 0, { target: stage }));
    handlers.pointerup?.(pointer(0, 0));

    expect(onClearSelectionRef.current).toHaveBeenCalledTimes(1);
    expect(controller.hasActiveGesture()).toBe(false);
  });

  it("背景未activated終端のclearから再入したpinchと並行してパンを再開しない", () => {
    const { stage, handlers } = createStage();
    const { controller, onClearSelectionRef, onViewportChangeRef } = createController();
    controller.bind(stage as never);

    let startedPinch = false;
    onClearSelectionRef.current = jest.fn(() => {
      if (startedPinch) return;
      startedPinch = true;
      handlers.pointerdown?.(pointer(0, 0, {
        pointerId: 1,
        pointerType: "touch",
        target: stage,
      }));
      handlers.pointerdown?.(pointer(100, 0, {
        pointerId: 2,
        pointerType: "touch",
        target: stage,
      }));
    });
    handlers.pointerdown?.(pointer(50, 50, {
      pointerId: 3,
      pointerType: "mouse",
      target: stage,
    }));
    handlers.pointerup?.(pointer(50, 50, { pointerId: 3, pointerType: "mouse" }));
    handlers.pointermove?.(pointer(80, 80, {
      pointerId: 3,
      pointerType: "mouse",
    }));

    expect(onViewportChangeRef.current).not.toHaveBeenCalled();

    handlers.pointermove?.(pointer(200, 0, {
      pointerId: 2,
      pointerType: "touch",
    }));
    expect(onViewportChangeRef.current).toHaveBeenCalledWith(expect.objectContaining({ scale: 2 }));
  });

  it("cancels the active connection before replacing it with a new pointerdown", () => {
    const { stage, handlers } = createStage();
    const onConnectionTargetChange = jest.fn();
    const { controller } = createController({
      nodes: [node, targetNode],
      onConnectionTargetChange,
    });
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(50, 50, { shiftKey: true }) as never);
    handlers.pointermove?.(pointer(220, 60));
    nodePointerDown(controller, 1, pointer(50, 50) as never);

    expect(onConnectionTargetChange.mock.calls).toEqual([[2], [null]]);
  });

  it("空白ドラッグを画面差分のviewport変更へ変換する", () => {
    const { stage, handlers } = createStage();
    const { controller, onClearSelectionRef, onViewportChangeRef } = createController({
      viewport: { offsetX: 40, offsetY: 20, scale: 2 },
    });
    controller.bind(stage as never);

    handlers.pointerdown?.(pointer(100, 80, { target: stage }));
    handlers.pointermove?.(pointer(110, 90));

    expect(onClearSelectionRef.current).not.toHaveBeenCalled();
    expect(onViewportChangeRef.current).toHaveBeenCalledWith({
      offsetX: 50,
      offsetY: 30,
      scale: 2,
    });
  });

  it("非等倍viewportでノードをワールド差分だけ移動する", () => {
    const { stage, handlers } = createStage();
    const { controller, onMoveNodeRef } = createController({
      viewport: { offsetX: 40, offsetY: 20, scale: 2 },
    });
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(80, 60, { path: [stage] }) as never);
    handlers.pointermove?.(pointer(100, 80));

    expect(onMoveNodeRef.current).toHaveBeenCalledWith(1, 30, 50);
  });

  it("非等倍viewportで接続先をワールド座標から判定する", () => {
    const { stage, handlers } = createStage();
    const { controller, onConnectionTargetChangeRef, onConnectNodesRef } = createController({
      nodes: [node, targetNode],
      viewport: { offsetX: 40, offsetY: 20, scale: 2 },
    });
    controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(80, 100, {
      shiftKey: true,
      path: [stage],
    }) as never);
    handlers.pointermove?.(pointer(480, 140));
    handlers.pointerup?.(pointer(480, 140));

    expect(onConnectionTargetChangeRef.current).toHaveBeenCalledWith(2);
    expect(onConnectNodesRef.current).toHaveBeenCalledWith(1, 2);
  });

  it("pointercancelで所有中のパンを停止する", () => {
    const { stage, handlers } = createStage();
    const { controller, onViewportChangeRef } = createController();
    controller.bind(stage as never);
    handlers.pointerdown?.(pointer(0, 0, { target: stage }));

    handlers.pointercancel?.(pointer(0, 0));
    handlers.pointermove?.(pointer(20, 20));

    expect(onViewportChangeRef.current).not.toHaveBeenCalled();
  });

  it("removes the same five listeners registered during binding", () => {
    const { stage, handlers } = createStage();
    const { controller } = createController();
    const cleanup = controller.bind(stage as never);
    const registeredHandlers = { ...handlers };

    cleanup();

    expect(stage.off).toHaveBeenCalledTimes(5);
    for (const eventName of ["pointerdown", "pointermove", "pointerup", "pointerupoutside", "pointercancel"] as const) {
      expect(stage.off).toHaveBeenCalledWith(eventName, registeredHandlers[eventName]);
    }
  });

  it("removes every listener even when active gesture cancellation throws", () => {
    const { stage, handlers } = createStage();
    const second = createStage();
    const onConnectionTargetChange = jest.fn((id: number | null) => {
      if (id === null) throw new Error("target cleanup failed");
    });
    const { controller, onConnectionTargetChangeRef, onClearSelectionRef } = createController({
      nodes: [node, targetNode],
      onConnectionTargetChange,
    });
    const cleanup = controller.bind(stage as never);

    nodePointerDown(controller, 1, pointer(50, 50, {
      shiftKey: true,
      pointerId: 1,
      pointerType: "touch",
    }) as never);
    handlers.pointermove?.(pointer(220, 60, { pointerId: 1, pointerType: "touch" }));

    expect(cleanup).toThrow("target cleanup failed");
    expect(stage.off).toHaveBeenCalledTimes(5);
    expect(handlers).toEqual({});

    const reboundClear = jest.fn();
    onConnectionTargetChangeRef.current = jest.fn();
    onClearSelectionRef.current = reboundClear;
    controller.bind(second.stage as never);
    second.handlers.pointerdown?.(pointer(0, 0, {
      pointerId: 2,
      pointerType: "touch",
      target: second.stage,
    }));
    second.handlers.pointerup?.(pointer(0, 0, { pointerId: 2, pointerType: "touch" }));

    expect(reboundClear).toHaveBeenCalledTimes(1);
  });

  it("continues cleanup and resets touch state when a listener removal throws", () => {
    const first = createStage();
    const second = createStage();
    const { controller, onClearSelectionRef } = createController();
    const cleanup = controller.bind(first.stage as never);
    first.handlers.pointerdown?.(pointer(0, 0, {
      pointerId: 1,
      pointerType: "touch",
      target: first.stage,
    }));
    const originalOff = first.stage.off.getMockImplementation()!;
    first.stage.off.mockImplementation((event: StageEvent, handler: Handler) => {
      if (event === "pointermove") throw new Error("listener cleanup failed");
      return originalOff(event, handler);
    });

    expect(cleanup).toThrow("listener cleanup failed");
    expect(first.stage.off).toHaveBeenCalledTimes(5);

    const reboundClear = jest.fn();
    onClearSelectionRef.current = reboundClear;
    controller.bind(second.stage as never);
    second.handlers.pointerdown?.(pointer(0, 0, {
      pointerId: 2,
      pointerType: "touch",
      target: second.stage,
    }));
    second.handlers.pointerup?.(pointer(0, 0, { pointerId: 2, pointerType: "touch" }));

    expect(reboundClear).toHaveBeenCalledTimes(1);
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
        nodePointerDown(controller, 1, pointer(50, 50, { pointerId: 2 }) as never);
      }
    });
    const cleanup = controller.bind(first.stage as never);

    nodePointerDown(controller, 1, pointer(50, 50, { shiftKey: true, pointerId: 1 }) as never);
    first.handlers.pointermove?.(pointer(220, 60, { pointerId: 1 }));
    cleanup();
    controller.bind(second.stage as never);
    second.handlers.pointermove?.(pointer(60, 60, { pointerId: 2 }));

    expect(onMoveNode).not.toHaveBeenCalled();

    nodePointerDown(controller, 1, pointer(50, 50, { pointerId: 3 }) as never);
    second.handlers.pointermove?.(pointer(60, 60, { pointerId: 3 }));

    expect(onMoveNode).toHaveBeenCalledWith(1, 30, 50);
  });

  it("古いcleanup中に作られた新bindingのtouch追跡をresetしない", () => {
    const first = createStage();
    const second = createStage();
    let rebound = false;
    const { controller, onConnectionTargetChangeRef, onViewportChangeRef } = createController({
      nodes: [node, targetNode],
    });
    onConnectionTargetChangeRef.current = jest.fn((id: number | null) => {
      if (id !== null || rebound) return;
      rebound = true;
      controller.bind(second.stage as never);
      second.handlers.pointerdown?.(pointer(0, 0, {
        pointerId: 2,
        pointerType: "touch",
        target: second.stage,
      }));
    });
    const cleanupFirst = controller.bind(first.stage as never);
    nodePointerDown(controller, 1, pointer(50, 50, {
      shiftKey: true,
      pointerId: 1,
      pointerType: "touch",
      path: [first.stage],
    }) as never);
    first.handlers.pointermove?.(pointer(60, 50, {
      pointerId: 1,
      pointerType: "touch",
    }));

    cleanupFirst();
    second.handlers.pointerdown?.(pointer(100, 0, {
      pointerId: 3,
      pointerType: "touch",
      target: second.stage,
    }));
    second.handlers.pointermove?.(pointer(200, 0, {
      pointerId: 3,
      pointerType: "touch",
    }));

    expect(onViewportChangeRef.current).toHaveBeenCalledWith(expect.objectContaining({ scale: 2 }));
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

    nodePointerDown(controller, 1, pointer(50, 50, { pointerId: 2 }) as never);
    cleanupFirst();
    second.handlers.pointermove?.(pointer(60, 60, { pointerId: 2 }));

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
      { pointerId: 1, path: [first.stage] },
    );
    cleanupFirst();
    controller.bind(second.stage as never);

    nodePointerDown(controller, 1, pointer(
      50,
      50,
      { pointerId: 2, path: [second.stage] },
    ) as never);
    nodePointerDown(controller, 1, delayedFirstEvent as never);
    second.handlers.pointermove?.(pointer(60, 60, { pointerId: 2 }));

    expect(onSelectNode.mock.calls).toEqual([[1]]);
    expect(onMoveNode).toHaveBeenCalledWith(1, 30, 50);
  });

  it("同一stageの再bind後は旧bindingのnode handlerを無視する", () => {
    const { stage, handlers } = createStage();
    const onMoveNode = jest.fn();
    const onSelectNode = jest.fn();
    const { controller } = createController({ onMoveNode, onSelectNode });
    const cleanupFirst = controller.bind(stage as never);
    const staleNodePointerDown = controller.createNodePointerDownHandler();
    cleanupFirst();
    controller.bind(stage as never);
    const currentNodePointerDown = controller.createNodePointerDownHandler();

    currentNodePointerDown(1, pointer(50, 50, { pointerId: 2, path: [stage] }) as never);
    staleNodePointerDown(1, pointer(50, 50, { pointerId: 1, path: [stage] }) as never);
    handlers.pointermove?.(pointer(60, 60, { pointerId: 2 }));

    expect(onSelectNode.mock.calls).toEqual([[1]]);
    expect(onMoveNode).toHaveBeenCalledWith(1, 30, 50);
  });

  it("2本目のtouchでnode gestureをキャンセルしてpinchへ置換する", () => {
    const { stage, handlers } = createStage();
    const { controller, onMoveNodeRef, onViewportChangeRef } = createController();
    controller.bind(stage as never);
    nodePointerDown(controller, 1, pointer(100, 100, {
      pointerId: 1,
      pointerType: "touch",
      path: [stage],
    }) as never);

    handlers.pointerdown?.(pointer(200, 100, {
      pointerId: 2,
      pointerType: "touch",
      target: stage,
    }));
    handlers.pointermove?.(pointer(300, 100, {
      pointerId: 2,
      pointerType: "touch",
    }));

    expect(onMoveNodeRef.current).not.toHaveBeenCalled();
    expect(onViewportChangeRef.current).toHaveBeenCalledWith(expect.objectContaining({ scale: 2 }));
  });

  it("pinch中のmouseによる空白パンを開始しない", () => {
    const { stage, handlers } = createStage();
    const { controller, onSelectNodeRef, onViewportChangeRef } = createController();
    controller.bind(stage as never);
    handlers.pointerdown?.(pointer(0, 0, {
      pointerId: 1,
      pointerType: "touch",
      target: stage,
    }));
    handlers.pointerdown?.(pointer(100, 0, {
      pointerId: 2,
      pointerType: "touch",
      target: stage,
    }));
    (onSelectNodeRef.current as jest.Mock).mockClear();
    onViewportChangeRef.current.mockClear();

    handlers.pointerdown?.(pointer(50, 50, {
      pointerId: 3,
      pointerType: "mouse",
      target: stage,
    }));
    handlers.pointermove?.(pointer(80, 80, {
      pointerId: 3,
      pointerType: "mouse",
    }));

    expect(onSelectNodeRef.current).not.toHaveBeenCalled();
    expect(onViewportChangeRef.current).not.toHaveBeenCalled();

    handlers.pointermove?.(pointer(200, 0, {
      pointerId: 2,
      pointerType: "touch",
    }));
    expect(onViewportChangeRef.current).toHaveBeenCalledWith(expect.objectContaining({ scale: 2 }));
  });

  it.each([
    { operation: "移動", shiftKey: false },
    { operation: "接続", shiftKey: true },
  ])("pinch中のpenによるノード$operationを開始しない", ({ shiftKey }) => {
    const { stage, handlers } = createStage();
    const {
      controller,
      onSelectNodeRef,
      onMoveNodeRef,
      onConnectNodesRef,
      onConnectionTargetChangeRef,
      onViewportChangeRef,
    } = createController({ nodes: [node, targetNode] });
    controller.bind(stage as never);
    handlers.pointerdown?.(pointer(0, 0, {
      pointerId: 1,
      pointerType: "touch",
      target: stage,
    }));
    handlers.pointerdown?.(pointer(100, 0, {
      pointerId: 2,
      pointerType: "touch",
      target: stage,
    }));
    (onSelectNodeRef.current as jest.Mock).mockClear();
    onViewportChangeRef.current.mockClear();

    nodePointerDown(controller, 1, pointer(50, 50, {
      pointerId: 3,
      pointerType: "pen",
      path: [stage],
      shiftKey,
    }) as never);
    handlers.pointermove?.(pointer(220, 60, {
      pointerId: 3,
      pointerType: "pen",
    }));
    handlers.pointerup?.(pointer(220, 60, {
      pointerId: 3,
      pointerType: "pen",
    }));

    expect(onSelectNodeRef.current).not.toHaveBeenCalled();
    expect(onMoveNodeRef.current).not.toHaveBeenCalled();
    expect(onConnectNodesRef.current).not.toHaveBeenCalled();
    expect(onConnectionTargetChangeRef.current).not.toHaveBeenCalled();
    expect(onViewportChangeRef.current).not.toHaveBeenCalled();

    handlers.pointermove?.(pointer(200, 0, {
      pointerId: 2,
      pointerType: "touch",
    }));
    expect(onViewportChangeRef.current).toHaveBeenCalledWith(expect.objectContaining({ scale: 2 }));
  });

  it("gesture cancel callbackから開始された新しいpinchを保持する", () => {
    const { stage, handlers } = createStage();
    let startedNextPinch = false;
    const { controller, onConnectionTargetChangeRef, onViewportChangeRef } = createController({
      nodes: [node, targetNode],
    });
    onConnectionTargetChangeRef.current = jest.fn((id: number | null) => {
      if (id === null && !startedNextPinch) {
        startedNextPinch = true;
        handlers.pointerdown?.(pointer(200, 100, {
          pointerId: 2,
          pointerType: "touch",
          target: stage,
        }));
      }
    });
    controller.bind(stage as never);
    nodePointerDown(controller, 1, pointer(100, 100, {
      shiftKey: true,
      pointerId: 1,
      pointerType: "touch",
      path: [stage],
    }) as never);
    handlers.pointermove?.(pointer(110, 100, {
      pointerId: 1,
      pointerType: "touch",
    }));

    controller.cancelActiveGesture();
    // 活性化で p1 が 110 に動いているので、開始距離 90 → 終了 180 で scale 2
    handlers.pointermove?.(pointer(290, 100, {
      pointerId: 2,
      pointerType: "touch",
    }));

    expect(controller.hasActiveGesture()).toBe(true);
    expect(onViewportChangeRef.current).toHaveBeenCalledWith(expect.objectContaining({ scale: 2 }));
  });

  it("node gestureのcancel callbackから再入したpinchと並行して操作を開始しない", () => {
    const { stage, handlers } = createStage();
    let startedPinch = false;
    const {
      controller,
      onSelectNodeRef,
      onMoveNodeRef,
      onConnectionTargetChangeRef,
      onViewportChangeRef,
    } = createController({ nodes: [node, targetNode] });
    onConnectionTargetChangeRef.current = jest.fn((id: number | null) => {
      if (id !== null || startedPinch) return;
      startedPinch = true;
      handlers.pointerdown?.(pointer(150, 50, {
        pointerId: 2,
        pointerType: "touch",
        target: stage,
      }));
    });
    controller.bind(stage as never);
    nodePointerDown(controller, 1, pointer(50, 50, {
      shiftKey: true,
      pointerId: 1,
      pointerType: "touch",
      path: [stage],
    }) as never);
    handlers.pointermove?.(pointer(60, 50, {
      pointerId: 1,
      pointerType: "touch",
    }));

    nodePointerDown(controller, 1, pointer(50, 50, {
      pointerId: 3,
      pointerType: "mouse",
      path: [stage],
    }) as never);
    handlers.pointermove?.(pointer(60, 60, {
      pointerId: 3,
      pointerType: "mouse",
    }));

    expect((onSelectNodeRef.current as jest.Mock).mock.calls).toEqual([[1]]);
    expect(onMoveNodeRef.current).not.toHaveBeenCalled();

    // 活性化で p1 が 60 に動いているので、開始距離 90 → 終了 180 で scale 2
    handlers.pointermove?.(pointer(240, 50, {
      pointerId: 2,
      pointerType: "touch",
    }));
    expect(onViewportChangeRef.current).toHaveBeenCalledWith(expect.objectContaining({ scale: 2 }));
  });

  it("pinchをcancelした後は通常gestureを開始できる", () => {
    const { stage, handlers } = createStage();
    const { controller, onMoveNodeRef } = createController();
    controller.bind(stage as never);
    handlers.pointerdown?.(pointer(0, 100, {
      pointerId: 1,
      pointerType: "touch",
      target: stage,
    }));
    handlers.pointerdown?.(pointer(100, 100, {
      pointerId: 2,
      pointerType: "touch",
      target: stage,
    }));

    controller.cancelActiveGesture();
    nodePointerDown(controller, 1, pointer(50, 50, {
      pointerId: 3,
      pointerType: "mouse",
      path: [stage],
    }) as never);
    handlers.pointermove?.(pointer(60, 60, { pointerId: 3, pointerType: "mouse" }));

    expect(controller.hasActiveGesture()).toBe(true);
    expect(onMoveNodeRef.current).toHaveBeenCalledWith(1, 30, 50);
  });

  it("pinch開始時のgesture cancel callbackからcleanupされても例外にしない", () => {
    const { stage, handlers } = createStage();
    let cleanup = () => {};
    const onConnectionTargetChange = jest.fn((id: number | null) => {
      if (id === null) cleanup();
    });
    const { controller } = createController({
      nodes: [node, targetNode],
      onConnectionTargetChange,
    });
    cleanup = controller.bind(stage as never);
    nodePointerDown(controller, 1, pointer(50, 50, {
      shiftKey: true,
      pointerId: 1,
      pointerType: "touch",
      path: [stage],
    }) as never);
    handlers.pointermove?.(pointer(60, 50, {
      pointerId: 1,
      pointerType: "touch",
    }));

    expect(() => handlers.pointerdown?.(pointer(200, 100, {
      pointerId: 2,
      pointerType: "touch",
      target: stage,
    }))).not.toThrow();
    expect(controller.hasActiveGesture()).toBe(false);
    expect(handlers).toEqual({});
  });

  it("pinch開始時のcancel callbackから開始された新gestureを保持する", () => {
    const { stage, handlers } = createStage();
    const onMoveNode = jest.fn();
    let startedNextGesture = false;
    const { controller, onConnectionTargetChangeRef, onViewportChangeRef } = createController({
      nodes: [node, targetNode],
      onMoveNode,
    });
    onConnectionTargetChangeRef.current = jest.fn((id: number | null) => {
      if (id === null && !startedNextGesture) {
        startedNextGesture = true;
        nodePointerDown(controller, 1, pointer(50, 50, {
          pointerId: 3,
          pointerType: "mouse",
          path: [stage],
        }) as never);
      }
    });
    controller.bind(stage as never);
    nodePointerDown(controller, 1, pointer(50, 50, {
      shiftKey: true,
      pointerId: 1,
      pointerType: "touch",
      path: [stage],
    }) as never);
    handlers.pointermove?.(pointer(60, 50, {
      pointerId: 1,
      pointerType: "touch",
    }));

    handlers.pointerdown?.(pointer(200, 100, {
      pointerId: 2,
      pointerType: "touch",
      target: stage,
    }));
    handlers.pointermove?.(pointer(300, 100, {
      pointerId: 2,
      pointerType: "touch",
    }));
    handlers.pointermove?.(pointer(60, 60, {
      pointerId: 3,
      pointerType: "mouse",
    }));

    expect(onViewportChangeRef.current).not.toHaveBeenCalled();
    expect(onMoveNode).toHaveBeenCalledWith(1, 30, 50);
  });


  describe("ノード移動の履歴グループ", () => {
    it("ドラッグ全体で一度だけグループを開始し、pointerupで一度だけ終了する", () => {
      const { stage, handlers } = createStage();
      const { lease, onBeginNodeMove } = createMoveHistorySpy();
      const { controller, onMoveNodeRef } = createController({ onBeginNodeMove });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(100, 60) as never);
      for (let step = 1; step <= 10; step += 1) {
        handlers.pointermove?.(pointer(100 + step * 5, 60));
      }
      handlers.pointerup?.(pointer(150, 60));

      expect(onMoveNodeRef.current).toHaveBeenCalledTimes(10);
      expect(onBeginNodeMove).toHaveBeenCalledTimes(1);
      expect(lease.finish).toHaveBeenCalledTimes(1);
    });

    it.each(["pointercancel", "pointerupoutside"] as const)(
      "%sでもグループを一度だけ終了する",
      (eventName) => {
        const { stage, handlers } = createStage();
        const { lease, onBeginNodeMove } = createMoveHistorySpy();
        const { controller } = createController({ onBeginNodeMove });
        controller.bind(stage as never);

        nodePointerDown(controller, 1, pointer(100, 60) as never);
        handlers.pointermove?.(pointer(120, 60));
        handlers[eventName]?.(pointer(120, 60));
        handlers.pointerup?.(pointer(120, 60));

        expect(onBeginNodeMove).toHaveBeenCalledTimes(1);
        expect(lease.finish).toHaveBeenCalledTimes(1);
      },
    );

    it("ピンチへの切り替えでグループを一度だけ終了する", () => {
      const { stage, handlers } = createStage();
      const { lease, onBeginNodeMove } = createMoveHistorySpy();
      const { controller } = createController({ onBeginNodeMove });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(100, 100, {
        pointerId: 1,
        pointerType: "touch",
        path: [stage],
      }) as never);
      handlers.pointermove?.(pointer(120, 100, { pointerId: 1, pointerType: "touch" }));
      handlers.pointerdown?.(pointer(200, 100, {
        pointerId: 2,
        pointerType: "touch",
        target: stage,
      }));
      handlers.pointerup?.(pointer(120, 100, { pointerId: 1, pointerType: "touch" }));

      expect(onBeginNodeMove).toHaveBeenCalledTimes(1);
      expect(lease.finish).toHaveBeenCalledTimes(1);
    });

    it("cancelActiveGestureでグループを一度だけ終了する", () => {
      const { stage, handlers } = createStage();
      const { lease, onBeginNodeMove } = createMoveHistorySpy();
      const { controller } = createController({ onBeginNodeMove });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(100, 60) as never);
      handlers.pointermove?.(pointer(120, 60));
      controller.cancelActiveGesture();
      controller.cancelActiveGesture();

      expect(lease.finish).toHaveBeenCalledTimes(1);
    });

    it("クリックだけではグループを開始しない", () => {
      const { stage, handlers } = createStage();
      const { lease, onBeginNodeMove } = createMoveHistorySpy();
      const { controller } = createController({ onBeginNodeMove });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(100, 60) as never);
      handlers.pointerup?.(pointer(100, 60));

      expect(onBeginNodeMove).not.toHaveBeenCalled();
      expect(lease.finish).not.toHaveBeenCalled();
    });

    it("Shiftの接続ドラッグではグループを開始しない", () => {
      const { stage, handlers } = createStage();
      const { onBeginNodeMove } = createMoveHistorySpy();
      const { controller } = createController({
        nodes: [node, targetNode],
        onBeginNodeMove,
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(100, 60, { shiftKey: true }) as never);
      handlers.pointermove?.(pointer(220, 60));
      handlers.pointerup?.(pointer(220, 60));

      expect(onBeginNodeMove).not.toHaveBeenCalled();
    });

    it("最新のグループ開始callbackを使う", () => {
      const { stage, handlers } = createStage();
      const { controller, onBeginNodeMoveRef } = createController();
      controller.bind(stage as never);
      const latest = createMoveHistorySpy();
      onBeginNodeMoveRef.current = latest.onBeginNodeMove;

      nodePointerDown(controller, 1, pointer(100, 60) as never);
      handlers.pointermove?.(pointer(120, 60));

      expect(latest.onBeginNodeMove).toHaveBeenCalledTimes(1);
    });
  });

  describe("兄弟の並べ替えのドラッグ", () => {
    // 縦に並んだ2つのルート。id 1 の中心は y 30、id 2 の中心は y 130
    const upperRoot: Node = createTestNode({ id: 1, parentId: null, x: 0, y: 0, label: "上" });
    const lowerRoot: Node = createTestNode({ id: 2, parentId: null, x: 0, y: 100, label: "下" });
    const stackedRoots: readonly Node[] = [upperRoot, lowerRoot];

    it("自動配置ではShiftなしのドラッグで並べ替え、移動しない", () => {
      const { stage, handlers } = createStage();
      const {
        controller,
        onMoveNodeRef,
        onBeginNodeMoveRef,
        onReorderSiblingRef,
        onSiblingReorderPreviewChangeRef,
      } = createController({ nodes: stackedRoots, layoutMode: "auto" });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 30) as never);
      handlers.pointermove?.(pointer(50, 140));
      handlers.pointerup?.(pointer(50, 140));

      expect(onReorderSiblingRef.current).toHaveBeenCalledTimes(1);
      expect(onReorderSiblingRef.current).toHaveBeenCalledWith(1, {
        kind: "drop",
        target: { position: "after", anchorId: 2 },
      });
      expect(onSiblingReorderPreviewChangeRef.current).toHaveBeenLastCalledWith(null);
      expect(onMoveNodeRef.current).not.toHaveBeenCalled();
      expect(onBeginNodeMoveRef.current).not.toHaveBeenCalled();
    });

    it("auto+ピンは座標ドラッグし並べ替えない（ドロップで finalize）", () => {
      const pinned = createTestNode({
        id: 1, parentId: null, x: 0, y: 0, label: "ピン", layoutPinned: true,
      });
      const sibling = createTestNode({ id: 2, parentId: null, x: 0, y: 100, label: "非ピン" });
      const onMovePinnedNode = jest.fn();
      const onFinalizePinnedNodeMove = jest.fn(() => true);
      const { stage, handlers } = createStage();
      const {
        controller,
        onMoveNodeRef,
        onReorderSiblingRef,
      } = createController({
        nodes: [pinned, sibling],
        layoutMode: "auto",
        onMovePinnedNode,
        onFinalizePinnedNodeMove,
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 30) as never);
      handlers.pointermove?.(pointer(50, 140));
      handlers.pointerup?.(pointer(50, 140));

      expect(onReorderSiblingRef.current).not.toHaveBeenCalled();
      expect(onMoveNodeRef.current).not.toHaveBeenCalled();
      expect(onMovePinnedNode).toHaveBeenCalled();
      expect(onFinalizePinnedNodeMove).toHaveBeenCalledTimes(1);
    });

    it("auto+ピンでコールバック欠落時は並べ替えせず無操作", () => {
      const pinned = createTestNode({
        id: 1, parentId: null, x: 0, y: 0, label: "ピン", layoutPinned: true,
      });
      const sibling = createTestNode({ id: 2, parentId: null, x: 0, y: 100, label: "非ピン" });
      const { stage, handlers } = createStage();
      const {
        controller,
        onMoveNodeRef,
        onReorderSiblingRef,
        onSiblingReorderPreviewChangeRef,
      } = createController({
        nodes: [pinned, sibling],
        layoutMode: "auto",
        // onMovePinnedNode / onFinalizePinnedNodeMove 欠落（保護・競合などで外す経路）
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 30) as never);
      handlers.pointermove?.(pointer(50, 140));
      handlers.pointerup?.(pointer(50, 140));

      expect(onReorderSiblingRef.current).not.toHaveBeenCalled();
      expect(onSiblingReorderPreviewChangeRef.current).not.toHaveBeenCalled();
      expect(onMoveNodeRef.current).not.toHaveBeenCalled();
    });

    it("auto+ピンのジェスチャ中に finalize が外れたら cancel し throw しない", () => {
      const pinned = createTestNode({
        id: 1, parentId: null, x: 0, y: 0, label: "ピン", layoutPinned: true,
      });
      const sibling = createTestNode({ id: 2, parentId: null, x: 0, y: 100, label: "非ピン" });
      const history = createMoveHistorySpy();
      const { stage, handlers } = createStage();
      const {
        controller,
        onMovePinnedNodeRef,
        onFinalizePinnedNodeMoveRef,
      } = createController({
        nodes: [pinned, sibling],
        layoutMode: "auto",
        onBeginNodeMove: history.onBeginNodeMove,
        onMovePinnedNode: jest.fn(),
        onFinalizePinnedNodeMove: jest.fn(() => true),
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 30) as never);
      onMovePinnedNodeRef.current = undefined;
      onFinalizePinnedNodeMoveRef.current = undefined;

      expect(() => {
        handlers.pointermove?.(pointer(50, 140));
        handlers.pointerup?.(pointer(50, 140));
      }).not.toThrow();

      expect(history.lease.cancel).toHaveBeenCalledTimes(1);
      expect(history.lease.finish).not.toHaveBeenCalled();
    });

    it("auto+非ピンは並べ替えのまま", () => {
      const { stage, handlers } = createStage();
      const onMovePinnedNode = jest.fn();
      const {
        controller,
        onReorderSiblingRef,
      } = createController({
        nodes: stackedRoots,
        layoutMode: "auto",
        onMovePinnedNode,
        onFinalizePinnedNodeMove: jest.fn(() => true),
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 30) as never);
      handlers.pointermove?.(pointer(50, 140));
      handlers.pointerup?.(pointer(50, 140));

      expect(onReorderSiblingRef.current).toHaveBeenCalled();
      expect(onMovePinnedNode).not.toHaveBeenCalled();
    });

    it("手動配置ではShiftなしのドラッグで今までどおり移動する", () => {
      const { stage, handlers } = createStage();
      const {
        controller,
        onMoveNodeRef,
        onBeginNodeMoveRef,
        onReorderSiblingRef,
        onSiblingReorderPreviewChangeRef,
      } = createController({ nodes: stackedRoots, layoutMode: "manual" });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 30) as never);
      handlers.pointermove?.(pointer(50, 140));
      handlers.pointerup?.(pointer(50, 140));

      expect(onBeginNodeMoveRef.current).toHaveBeenCalledTimes(1);
      expect(onMoveNodeRef.current).toHaveBeenCalledWith(1, 0, 110);
      expect(onReorderSiblingRef.current).not.toHaveBeenCalled();
      expect(onSiblingReorderPreviewChangeRef.current).not.toHaveBeenCalled();
    });

    it.each(["auto", "manual"] as const)("%sの配置でもShiftありのドラッグは接続する", (layoutMode) => {
      const { stage, handlers } = createStage();
      const {
        controller,
        onMoveNodeRef,
        onConnectNodesRef,
        onReorderSiblingRef,
        onSiblingReorderPreviewChangeRef,
      } = createController({ nodes: stackedRoots, layoutMode });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 30, { shiftKey: true }) as never);
      handlers.pointermove?.(pointer(50, 130));
      handlers.pointerup?.(pointer(50, 130));

      expect(onConnectNodesRef.current).toHaveBeenCalledWith(1, 2);
      expect(onMoveNodeRef.current).not.toHaveBeenCalled();
      expect(onReorderSiblingRef.current).not.toHaveBeenCalled();
      expect(onSiblingReorderPreviewChangeRef.current).not.toHaveBeenCalled();
    });

    it.each(["pointerupoutside", "pointercancel"] as const)("%sで中止し、プレビューを消して並べ替えない", (eventName) => {
      const { stage, handlers } = createStage();
      const {
        controller,
        onReorderSiblingRef,
        onSiblingReorderPreviewChangeRef,
      } = createController({ nodes: stackedRoots, layoutMode: "auto" });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 30) as never);
      handlers.pointermove?.(pointer(50, 140));
      expect(onSiblingReorderPreviewChangeRef.current).toHaveBeenLastCalledWith(
        expect.objectContaining({ nodeId: 1 }),
      );
      handlers[eventName]?.(pointer(50, 140));
      handlers.pointerup?.(pointer(50, 140));

      expect(onSiblingReorderPreviewChangeRef.current).toHaveBeenLastCalledWith(null);
      expect(onReorderSiblingRef.current).not.toHaveBeenCalled();
      expect(controller.isSiblingReorderActive()).toBe(false);
    });

    it("2本目の指で中止し、プレビューを消して並べ替えない", () => {
      const { stage, handlers } = createStage();
      const {
        controller,
        onReorderSiblingRef,
        onSiblingReorderPreviewChangeRef,
      } = createController({ nodes: stackedRoots, layoutMode: "auto" });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 30, {
        pointerId: 1,
        pointerType: "touch",
        path: [stage],
      }) as never);
      handlers.pointermove?.(pointer(50, 140, { pointerId: 1, pointerType: "touch" }));
      expect(onSiblingReorderPreviewChangeRef.current).toHaveBeenLastCalledWith(
        expect.objectContaining({ nodeId: 1 }),
      );
      nodePointerDown(controller, 2, pointer(50, 130, {
        pointerId: 2,
        pointerType: "touch",
        path: [stage],
      }) as never);
      handlers.pointerup?.(pointer(50, 140, { pointerId: 1, pointerType: "touch" }));

      expect(onSiblingReorderPreviewChangeRef.current).toHaveBeenLastCalledWith(null);
      expect(onReorderSiblingRef.current).not.toHaveBeenCalled();
      expect(controller.isSiblingReorderActive()).toBe(false);
    });

    it("自動配置の並べ替えの途中だけisSiblingReorderActiveがtrueになり、終わるとfalseに戻る", () => {
      const { stage, handlers } = createStage();
      const { controller } = createController({ nodes: stackedRoots, layoutMode: "auto" });
      controller.bind(stage as never);

      expect(controller.isSiblingReorderActive()).toBe(false);
      nodePointerDown(controller, 1, pointer(50, 30) as never);
      expect(controller.isSiblingReorderActive()).toBe(true);
      handlers.pointermove?.(pointer(50, 140));
      expect(controller.isSiblingReorderActive()).toBe(true);
      handlers.pointerup?.(pointer(50, 140));

      expect(controller.isSiblingReorderActive()).toBe(false);
    });

    it("トグル修飾キーから並べ替えへ遷移した途中もisSiblingReorderActiveがtrueになり、cancelActiveGestureで取消できる", () => {
      const { stage, handlers } = createStage();
      const { controller, onReorderSiblingRef, onToggleNodeSelectionRef } = createController({
        nodes: stackedRoots,
        layoutMode: "auto",
        isApplePlatform: () => true,
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 30, { metaKey: true }) as never);
      expect(controller.isSiblingReorderActive()).toBe(false);

      handlers.pointermove?.(pointer(50, 140, { metaKey: true }));
      expect(controller.isSiblingReorderActive()).toBe(true);

      controller.cancelActiveGesture();
      handlers.pointerup?.(pointer(50, 140, { metaKey: true }));

      expect(controller.isSiblingReorderActive()).toBe(false);
      expect(onReorderSiblingRef.current).not.toHaveBeenCalled();
      expect(onToggleNodeSelectionRef.current).not.toHaveBeenCalled();
    });

    it("cancelActiveGestureの後はisSiblingReorderActiveがfalseになる", () => {
      const { stage, handlers } = createStage();
      const { controller, onReorderSiblingRef } = createController({ nodes: stackedRoots, layoutMode: "auto" });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 30) as never);
      handlers.pointermove?.(pointer(50, 140));
      controller.cancelActiveGesture();
      handlers.pointerup?.(pointer(50, 140));

      expect(controller.isSiblingReorderActive()).toBe(false);
      expect(onReorderSiblingRef.current).not.toHaveBeenCalled();
    });

    it("手動配置の移動の途中はisSiblingReorderActiveがfalseになる", () => {
      const { stage, handlers } = createStage();
      const { controller } = createController({ nodes: stackedRoots, layoutMode: "manual" });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 30) as never);
      handlers.pointermove?.(pointer(50, 140));

      expect(controller.hasActiveGesture()).toBe(true);
      expect(controller.isSiblingReorderActive()).toBe(false);
    });

    it.each(["auto", "manual"] as const)("%sの配置のパンの途中はisSiblingReorderActiveがfalseになる", (layoutMode) => {
      const { stage, handlers } = createStage();
      const { controller } = createController({ nodes: stackedRoots, layoutMode });
      controller.bind(stage as never);

      handlers.pointerdown?.(pointer(400, 400, { target: stage }));
      handlers.pointermove?.(pointer(450, 450));

      expect(controller.hasActiveGesture()).toBe(true);
      expect(controller.isSiblingReorderActive()).toBe(false);
    });

    it("自動配置のShiftの接続の途中はisSiblingReorderActiveがfalseになる", () => {
      const { stage, handlers } = createStage();
      const { controller } = createController({ nodes: stackedRoots, layoutMode: "auto" });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 30, { shiftKey: true }) as never);
      handlers.pointermove?.(pointer(50, 130));

      expect(controller.hasActiveGesture()).toBe(true);
      expect(controller.isSiblingReorderActive()).toBe(false);
    });

    it("visibleNodeIdsRefを渡すと、隠れた兄弟を飛ばして挿入位置を決める", () => {
      // id 2 が見えていれば y 140 は id 2 の後ろになるが、隠れているので元の位置のまま
      const thirdRoot: Node = createTestNode({ id: 3, parentId: null, x: 0, y: 200, label: "末尾" });
      const { stage, handlers } = createStage();
      const { controller, onReorderSiblingRef } = createController({
        nodes: [upperRoot, lowerRoot, thirdRoot],
        visibleNodeIds: new Set([1, 3]),
        layoutMode: "auto",
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 30) as never);
      handlers.pointermove?.(pointer(50, 140));
      handlers.pointerup?.(pointer(50, 140));

      expect(onReorderSiblingRef.current).not.toHaveBeenCalled();
    });
  });

  describe("非有限の座標の入力", () => {
    it("ノードのpointerdownでは接続を開始せず、選択もしない", () => {
      // 接続の生成関数は座標を確かめないので、呼び出し側の判定だけが止める
      const { stage } = createStage();
      const { controller, onSelectNodeRef } = createController();
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(Number.NaN, 60, { shiftKey: true }) as never);

      expect(onSelectNodeRef.current).not.toHaveBeenCalled();
      expect(controller.hasActiveGesture()).toBe(false);
    });

    it("ノードのpointerdownでは所有中のgestureを止めない", () => {
      const { stage, handlers } = createStage();
      const { controller, onMoveNodeRef, onSelectNodeRef } = createController();
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(100, 60, { pointerId: 1 }) as never);
      nodePointerDown(controller, 1, pointer(Number.NaN, 60, { pointerId: 2 }) as never);
      handlers.pointermove?.(pointer(108, 66, { pointerId: 1 }));

      expect((onSelectNodeRef.current as jest.Mock).mock.calls).toEqual([[1]]);
      expect(onMoveNodeRef.current).toHaveBeenCalledWith(1, 28, 46);
    });

    it("空白のpointerdownでは選択を解除せず、パンも開始しない", () => {
      const { stage, handlers } = createStage();
      const { controller, onSelectNodeRef } = createController();
      controller.bind(stage as never);

      handlers.pointerdown?.(pointer(Number.NaN, 60, { target: stage }));

      expect(onSelectNodeRef.current).not.toHaveBeenCalled();
      expect(controller.hasActiveGesture()).toBe(false);
    });

    it("pointermoveでは接続先の候補を変えない", () => {
      // 接続のmoveは座標を確かめず候補なしとして扱うので、呼び出し側の判定だけが候補を守る
      const { stage, handlers } = createStage();
      const { controller, onConnectionTargetChangeRef } = createController({
        nodes: [node, targetNode],
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 50, { shiftKey: true }) as never);
      handlers.pointermove?.(pointer(220, 60));
      handlers.pointermove?.(pointer(Number.NaN, 60));

      expect((onConnectionTargetChangeRef.current as jest.Mock).mock.calls).toEqual([[2]]);
      expect(controller.activeNodeIds()).toEqual([1, 2]);
    });
  });

  describe("解放したbindingのstageのイベント", () => {
    // 解放の前にハンドラーを控え、新しいbindingで同じpointerのgestureを持たせる
    function bindSecondStageWithGesture() {
      const first = createStage();
      const second = createStage();
      const created = createController();
      const cleanupFirst = created.controller.bind(first.stage as never);
      const staleHandlers = { ...first.handlers };
      cleanupFirst();
      created.controller.bind(second.stage as never);
      nodePointerDown(created.controller, 1, pointer(100, 60, { pointerId: 1 }) as never);

      return { ...created, first, second, staleHandlers };
    }

    it.each(["pointerup", "pointerupoutside", "pointercancel"] as const)(
      "%sでは新しいbindingのgestureを止めない",
      (eventName) => {
        const { controller, second, staleHandlers, onMoveNodeRef } = bindSecondStageWithGesture();

        staleHandlers[eventName]?.(pointer(100, 60, { pointerId: 1 }));
        second.handlers.pointermove?.(pointer(108, 66, { pointerId: 1 }));

        expect(controller.hasActiveGesture()).toBe(true);
        expect(onMoveNodeRef.current).toHaveBeenCalledWith(1, 28, 46);
      },
    );

    it("pointermoveでは新しいbindingのgestureを動かさない", () => {
      const { staleHandlers, onMoveNodeRef } = bindSecondStageWithGesture();

      staleHandlers.pointermove?.(pointer(108, 66, { pointerId: 1 }));

      expect(onMoveNodeRef.current).not.toHaveBeenCalled();
    });

    it("pointerdownでは選択を解除せず、新しいbindingのgestureを止めない", () => {
      const { controller, first, staleHandlers, onSelectNodeRef } = bindSecondStageWithGesture();

      staleHandlers.pointerdown?.(pointer(0, 0, { pointerId: 1, target: first.stage }));

      expect((onSelectNodeRef.current as jest.Mock).mock.calls).toEqual([[1]]);
      expect(controller.hasActiveGesture()).toBe(true);
    });
  });

  describe("ノードが操作できるかのガード", () => {
    it("別pointerで隠れたノードを押しても所有中のgestureを止めない", () => {
      const { stage, handlers } = createStage();
      const { controller, onMoveNodeRef, onSelectNodeRef } = createController({
        nodes: [node, targetNode],
        visibleNodeIds: new Set([1]),
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(100, 60, { pointerId: 1 }) as never);
      nodePointerDown(controller, 2, pointer(220, 60, { pointerId: 2 }) as never);
      handlers.pointermove?.(pointer(108, 66, { pointerId: 1 }));

      expect((onSelectNodeRef.current as jest.Mock).mock.calls).toEqual([[1]]);
      expect(onMoveNodeRef.current).toHaveBeenCalledWith(1, 28, 46);
    });

    // 接続のcancelは候補をnullへ戻すcallbackを呼ぶ。ここで状況を変えて、新しいpointerdownの
    // 1回目のガードの後、2回目のガードの前に変化が起きるようにする
    function startConnectionThenPressTarget(
      created: ReturnType<typeof createController>,
      stage: FakeStage,
      onCancel: () => void,
      handlers: Partial<Record<StageEvent, Handler>>,
    ) {
      created.onConnectionTargetChangeRef.current = jest.fn((id: number | null) => {
        if (id === null) onCancel();
      });

      nodePointerDown(created.controller, 1, pointer(50, 50, {
        shiftKey: true,
        pointerId: 1,
        path: [stage],
      }) as never);
      // Shift はしきい値超で接続本体が始まる
      handlers.pointermove?.(pointer(60, 50, { pointerId: 1 }));
      nodePointerDown(created.controller, 2, pointer(220, 60, {
        pointerId: 2,
        path: [stage],
      }) as never);
    }

    it("進行中のgestureのcancel中にノードが消えると、開始も選択もしない", () => {
      const { stage, handlers } = createStage();
      const created = createController({ nodes: [node, targetNode] });
      created.controller.bind(stage as never);

      startConnectionThenPressTarget(created, stage, () => {
        created.nodesRef.current = [node];
      }, handlers);

      expect((created.onSelectNodeRef.current as jest.Mock).mock.calls).toEqual([[1]]);
      expect(created.controller.hasActiveGesture()).toBe(false);
    });

    it("進行中のgestureのcancel中にノードが隠れると、開始も選択もしない", () => {
      const { stage, handlers } = createStage();
      const created = createController({
        nodes: [node, targetNode],
        visibleNodeIds: new Set([1, 2]),
      });
      created.controller.bind(stage as never);

      startConnectionThenPressTarget(created, stage, () => {
        created.visibleNodeIdsRef!.current = new Set([1]);
      }, handlers);

      expect((created.onSelectNodeRef.current as jest.Mock).mock.calls).toEqual([[1]]);
      expect(created.controller.hasActiveGesture()).toBe(false);
    });

    it("進行中のgestureのcancel中にbindingが解放されると、開始も選択もしない", () => {
      const { stage, handlers } = createStage();
      const created = createController({ nodes: [node, targetNode] });
      const cleanup = created.controller.bind(stage as never);

      startConnectionThenPressTarget(created, stage, cleanup, handlers);

      expect((created.onSelectNodeRef.current as jest.Mock).mock.calls).toEqual([[1]]);
      expect(created.controller.hasActiveGesture()).toBe(false);
    });
  });

  describe("複数選択ポインタ分岐（Task 3）", () => {
    const nodeA = createTestNode({ id: 1, x: 20, y: 40, width: 100, height: 60, label: "A" });
    const nodeB = createTestNode({ id: 2, x: 200, y: 40, width: 100, height: 60, label: "B" });
    const nodeC = createTestNode({ id: 3, x: 380, y: 40, width: 100, height: 60, label: "C" });

    it("プレーンクリックは pointerdown で単一選択する", () => {
      const { stage } = createStage();
      const { controller, onSelectNodeRef, onToggleNodeSelectionRef } = createController({
        nodes: [nodeA, nodeB],
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 2, pointer(50, 50) as never);

      expect(onSelectNodeRef.current).toHaveBeenCalledWith(2);
      expect(onToggleNodeSelectionRef.current).not.toHaveBeenCalled();
    });

    it("Apple では metaKey の pointerup（未 activated）でトグルする", () => {
      const { stage, handlers } = createStage();
      const { controller, onToggleNodeSelectionRef, onSelectNodeRef } = createController({
        nodes: [nodeA, nodeB],
        isApplePlatform: () => true,
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 2, pointer(50, 50, { metaKey: true }) as never);
      expect(onToggleNodeSelectionRef.current).not.toHaveBeenCalled();
      expect(onSelectNodeRef.current).not.toHaveBeenCalled();

      handlers.pointerup?.(pointer(50, 50, { metaKey: true }));
      expect(onToggleNodeSelectionRef.current).toHaveBeenCalledWith(2);
    });

    it("非 Apple では ctrlKey の pointerup（未 activated）でトグルする", () => {
      const { stage, handlers } = createStage();
      const { controller, onToggleNodeSelectionRef } = createController({
        nodes: [nodeA, nodeB],
        isApplePlatform: () => false,
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 2, pointer(50, 50, { ctrlKey: true }) as never);
      handlers.pointerup?.(pointer(50, 50, { ctrlKey: true }));

      expect(onToggleNodeSelectionRef.current).toHaveBeenCalledWith(2);
    });

    it("Apple で ctrlKey のみではトグルしない（L-149）", () => {
      const { stage, handlers } = createStage();
      const { controller, onToggleNodeSelectionRef, onSelectNodeRef } = createController({
        nodes: [nodeA, nodeB],
        isApplePlatform: () => true,
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 2, pointer(50, 50, { ctrlKey: true }) as never);
      handlers.pointerup?.(pointer(50, 50, { ctrlKey: true }));

      expect(onToggleNodeSelectionRef.current).not.toHaveBeenCalled();
      expect(onSelectNodeRef.current).toHaveBeenCalledWith(2);
    });

    it("Shift+pointerdown では選択を変えない", () => {
      const { stage } = createStage();
      const { controller, onSelectNodeRef, onSelectNodeRangeRef } = createController({
        nodes: [nodeA, nodeB, nodeC],
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 3, pointer(50, 50, { shiftKey: true }) as never);

      expect(onSelectNodeRef.current).not.toHaveBeenCalled();
      expect(onSelectNodeRangeRef.current).not.toHaveBeenCalled();
    });

    it("Shift+クリック（未 activated）は範囲選択する", () => {
      const { stage, handlers } = createStage();
      const { controller, onSelectNodeRangeRef, onSelectNodeRef, onConnectNodesRef } = createController({
        nodes: [nodeA, nodeB, nodeC],
        visibleNodeIds: new Set([1, 2, 3]),
      });
      controller.bind(stage as never);

      nodePointerDown(controller, 3, pointer(50, 50, { shiftKey: true }) as never);
      handlers.pointerup?.(pointer(51, 50, { shiftKey: true }));

      expect(onSelectNodeRangeRef.current).toHaveBeenCalledWith(3, [1, 2, 3]);
      expect(onSelectNodeRef.current).not.toHaveBeenCalled();
      expect(onConnectNodesRef.current).not.toHaveBeenCalled();
    });

    it("Shift+ドラッグ（activated）は単一置換して接続を開始する", () => {
      const { stage, handlers } = createStage();
      const {
        controller,
        onSelectNodeRef,
        onSelectNodeRangeRef,
        onConnectionTargetChangeRef,
        onConnectNodesRef,
      } = createController({ nodes: [nodeA, nodeB] });
      controller.bind(stage as never);

      nodePointerDown(controller, 1, pointer(50, 50, { shiftKey: true }) as never);
      handlers.pointermove?.(pointer(60, 50, { shiftKey: true }));
      expect(onSelectNodeRef.current).toHaveBeenCalledWith(1);
      expect(onSelectNodeRangeRef.current).not.toHaveBeenCalled();

      handlers.pointermove?.(pointer(220, 60, { shiftKey: true }));
      handlers.pointerup?.(pointer(220, 60, { shiftKey: true }));

      expect(onConnectionTargetChangeRef.current).toHaveBeenCalledWith(2);
      expect(onConnectNodesRef.current).toHaveBeenCalledWith(1, 2);
    });

    it.each(["pointerup", "pointerupoutside", "pointercancel"] as const)(
      "背景未 activated の %s は修飾キー問わず clear する",
      (eventName) => {
        const { stage, handlers } = createStage();
        const { controller, onClearSelectionRef } = createController();
        controller.bind(stage as never);

        handlers.pointerdown?.(pointer(0, 0, { target: stage, metaKey: true, shiftKey: true }));
        handlers[eventName]?.(pointer(1, 0, { metaKey: true, shiftKey: true }));

        expect(onClearSelectionRef.current).toHaveBeenCalledTimes(1);
      },
    );

    it.each(["pointerup", "pointerupoutside", "pointercancel"] as const)(
      "背景 activated（パン）後の %s では clear しない",
      (eventName) => {
        const { stage, handlers } = createStage();
        const { controller, onClearSelectionRef, onViewportChangeRef } = createController();
        controller.bind(stage as never);

        handlers.pointerdown?.(pointer(0, 0, { target: stage }));
        handlers.pointermove?.(pointer(10, 0));
        expect(onViewportChangeRef.current).toHaveBeenCalled();
        handlers[eventName]?.(pointer(10, 0));

        expect(onClearSelectionRef.current).not.toHaveBeenCalled();
      },
    );

    it("Alt 開始の背景 pointerdown では clear せずパンしない", () => {
      const { stage, handlers } = createStage();
      const { controller, onClearSelectionRef, onViewportChangeRef } = createController();
      controller.bind(stage as never);

      handlers.pointerdown?.(pointer(0, 0, { target: stage, altKey: true }));
      expect(onClearSelectionRef.current).not.toHaveBeenCalled();

      handlers.pointermove?.(pointer(10, 0, { altKey: true }));
      expect(onViewportChangeRef.current).not.toHaveBeenCalled();

      handlers.pointerup?.(pointer(10, 0, { altKey: true }));
      // activated 済みなので clear しない
      expect(onClearSelectionRef.current).not.toHaveBeenCalled();
    });

    it("Alt 未 activated 終端では clear する", () => {
      const { stage, handlers } = createStage();
      const { controller, onClearSelectionRef } = createController();
      controller.bind(stage as never);

      handlers.pointerdown?.(pointer(0, 0, { target: stage, altKey: true }));
      handlers.pointerup?.(pointer(1, 0, { altKey: true }));

      expect(onClearSelectionRef.current).toHaveBeenCalledTimes(1);
    });

    it("Alt ドラッグ確定は交差ノードを配列順で replace し、clearSelection しない", () => {
      const { stage, handlers } = createStage();
      const {
        controller,
        onClearSelectionRef,
        onSetSelectionFromMarqueeRef,
        onMarqueeRectChangeRef,
        onViewportChangeRef,
      } = createController({
        nodes: [node, targetNode],
        visibleNodeIds: new Set([1, 2]),
      });
      controller.bind(stage as never);

      handlers.pointerdown?.(pointer(0, 0, { target: stage, altKey: true }));
      handlers.pointermove?.(pointer(250, 80, { altKey: true }));
      expect(onViewportChangeRef.current).not.toHaveBeenCalled();
      expect(onMarqueeRectChangeRef.current).toHaveBeenCalled();
      handlers.pointerup?.(pointer(250, 80, { altKey: true }));

      expect(onSetSelectionFromMarqueeRef.current).toHaveBeenCalledWith({
        mode: "replace",
        ids: [1, 2],
      });
      expect(onMarqueeRectChangeRef.current).toHaveBeenLastCalledWith(null);
      expect(onClearSelectionRef.current).not.toHaveBeenCalled();
    });

    it("Alt+Cmd（Apple）確定は add モード", () => {
      const { stage, handlers } = createStage();
      const { controller, onSetSelectionFromMarqueeRef } = createController({
        nodes: [node, targetNode],
        isApplePlatform: () => true,
      });
      controller.bind(stage as never);

      handlers.pointerdown?.(pointer(0, 0, { target: stage, altKey: true, metaKey: true }));
      handlers.pointermove?.(pointer(250, 80, { altKey: true, metaKey: true }));
      handlers.pointerup?.(pointer(250, 80, { altKey: true, metaKey: true }));

      expect(onSetSelectionFromMarqueeRef.current).toHaveBeenCalledWith({
        mode: "add",
        ids: [1, 2],
      });
    });

    it("Alt+Ctrl（非 Apple）確定は add モード", () => {
      const { stage, handlers } = createStage();
      const { controller, onSetSelectionFromMarqueeRef } = createController({
        nodes: [node, targetNode],
        isApplePlatform: () => false,
      });
      controller.bind(stage as never);

      handlers.pointerdown?.(pointer(0, 0, { target: stage, altKey: true, ctrlKey: true }));
      handlers.pointermove?.(pointer(250, 80, { altKey: true, ctrlKey: true }));
      handlers.pointerup?.(pointer(250, 80, { altKey: true, ctrlKey: true }));

      expect(onSetSelectionFromMarqueeRef.current).toHaveBeenCalledWith({
        mode: "add",
        ids: [1, 2],
      });
    });

    it("Alt なし背景ドラッグはパンのまま", () => {
      const { stage, handlers } = createStage();
      const {
        controller,
        onViewportChangeRef,
        onSetSelectionFromMarqueeRef,
        onMarqueeRectChangeRef,
      } = createController();
      controller.bind(stage as never);

      handlers.pointerdown?.(pointer(0, 0, { target: stage }));
      handlers.pointermove?.(pointer(10, 0));
      handlers.pointerup?.(pointer(10, 0));

      expect(onViewportChangeRef.current).toHaveBeenCalled();
      expect(onSetSelectionFromMarqueeRef.current).not.toHaveBeenCalled();
      expect(onMarqueeRectChangeRef.current).not.toHaveBeenCalled();
    });
  });
});
