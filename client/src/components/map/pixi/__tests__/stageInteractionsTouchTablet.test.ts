import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";
import { createStageInteractions } from "@/components/map/pixi/stageInteractions";
import { TOUCH_LONG_PRESS_CONTEXT_MS } from "@/domain/map/touchTabletConstants";
import { createTestNode } from "@/testing/createTestNode";
import { createTestMapHistoryLease } from "@/testing/createTestMapHistoryLease";

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

let boundStage: unknown = null;

function pointer(
  globalX: number,
  globalY: number,
  options: Partial<PointerEvent> & { path?: unknown[] } = {},
): PointerEvent {
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
    composedPath: () => options.path ?? (boundStage === null ? [] : [boundStage]),
  };
}

function createHarness({
  onLongPressContextMenu = jest.fn(),
  shouldIgnorePointerDown = () => false,
}: {
  onLongPressContextMenu?: (request: { nodeId: number; client: { x: number; y: number } }) => void;
  shouldIgnorePointerDown?: () => boolean;
} = {}) {
  const node = createTestNode({ id: 1, x: 20, y: 40, width: 100, height: 60 });
  const onSelectNode = jest.fn();
  const onMoveNode = jest.fn();
  const stageHandlers: Record<string, (event: PointerEvent) => void> = {};
  const stage: { on: jest.Mock; off: jest.Mock } = {
    on: jest.fn((event: string, handler: (event: PointerEvent) => void) => {
      boundStage = stage;
      stageHandlers[event] = handler;
      return stage;
    }),
    off: jest.fn(),
  };
  const controller = createStageInteractions({
    nodesRef: { current: [node] },
    viewportRef: { current: INITIAL_VIEWPORT },
    onSelectNodeRef: { current: onSelectNode },
    onMoveNodeRef: { current: onMoveNode },
    onBeginNodeMoveRef: { current: jest.fn(createTestMapHistoryLease) },
    onConnectNodesRef: { current: jest.fn() },
    onConnectionTargetChangeRef: { current: jest.fn() },
    onViewportChangeRef: { current: jest.fn() },
    layoutModeRef: { current: "manual" },
    onReorderSiblingRef: { current: jest.fn() },
    onSiblingReorderPreviewChangeRef: { current: jest.fn() },
    shouldIgnorePointerDownRef: { current: shouldIgnorePointerDown },
    onLongPressContextMenuRef: { current: onLongPressContextMenu },
  });
  controller.bind(stage as never);
  const nodePointerDown = controller.createNodePointerDownHandler();
  return {
    controller,
    stageHandlers,
    nodePointerDown,
    onSelectNode,
    onMoveNode,
    onLongPressContextMenu,
    node,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  boundStage = null;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("stageInteractions touch tablet", () => {
  it("タッチ長押しでコンテキストメニュー入口を呼ぶ", () => {
    const onLongPressContextMenu = jest.fn();
    const { nodePointerDown, onLongPressContextMenu: onLongPress } = createHarness({ onLongPressContextMenu });
    nodePointerDown(1, pointer(70, 70, { pointerType: "touch", path: [boundStage] }) as never);
    jest.advanceTimersByTime(TOUCH_LONG_PRESS_CONTEXT_MS);
    expect(onLongPress).toHaveBeenCalledWith({
      nodeId: 1,
      client: { x: 70, y: 70 },
    });
  });

  it("移動超過でドラッグへ移り長押しメニューを開かない", () => {
    const onLongPressContextMenu = jest.fn();
    const { nodePointerDown, onMoveNode, stageHandlers } = createHarness({ onLongPressContextMenu });
    nodePointerDown(1, pointer(70, 70, { pointerType: "touch", path: [boundStage] }) as never);
    stageHandlers.pointermove?.(pointer(90, 70, { pointerType: "touch" }));
    jest.advanceTimersByTime(TOUCH_LONG_PRESS_CONTEXT_MS);
    expect(onLongPressContextMenu).not.toHaveBeenCalled();
    expect(onMoveNode).toHaveBeenCalled();
  });

  it("2本目の指でピンチに入ったあと長押しメニューを開かない", () => {
    const onLongPressContextMenu = jest.fn();
    const { nodePointerDown, stageHandlers, onLongPressContextMenu: onLongPress } = createHarness({
      onLongPressContextMenu,
    });
    nodePointerDown(1, pointer(70, 70, { pointerId: 1, pointerType: "touch", path: [boundStage] }) as never);
    stageHandlers.pointerdown?.(pointer(200, 70, { pointerId: 2, pointerType: "touch", target: boundStage }));
    jest.advanceTimersByTime(TOUCH_LONG_PRESS_CONTEXT_MS);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("dialogMouseClickedAtRef 相当の無視窓中は長押しを開始しない", () => {
    const onLongPressContextMenu = jest.fn();
    const { nodePointerDown, onLongPressContextMenu: onLongPress } = createHarness({
      onLongPressContextMenu,
      shouldIgnorePointerDown: () => true,
    });
    nodePointerDown(1, pointer(70, 70, { pointerType: "touch", path: [boundStage] }) as never);
    jest.advanceTimersByTime(TOUCH_LONG_PRESS_CONTEXT_MS);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});