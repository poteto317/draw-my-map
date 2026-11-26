import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";
import type { PointerSample } from "@/components/map/pixi/pointerGesture";
import { createTouchLongPressGesture } from "@/components/map/pixi/touchLongPressGesture";
import { TOUCH_LONG_PRESS_CONTEXT_MS } from "@/domain/map/touchTabletConstants";

function touch(pointerId: number, x: number, y: number): PointerSample {
  return {
    pointerId,
    pointerType: "touch",
    screen: { x, y },
    world: { x, y },
  };
}

describe("createTouchLongPressGesture", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("長押し完了でコンテキストを開き、ドラッグ閾値未満なら移動ジェスチャを開始しない", () => {
    const onLongPressContextMenu = jest.fn();
    const createActivatedDragGesture = jest.fn(() => ({
      move: jest.fn(),
      end: jest.fn(),
      cancel: jest.fn(),
      isActivated: () => true,
    }));
    const gesture = createTouchLongPressGesture({
      nodeId: 1,
      startSample: touch(1, 50, 60),
      onLongPressContextMenuRef: { current: onLongPressContextMenu },
      createActivatedDragGesture,
      dragThreshold: 4,
      shouldAbortLongPressRef: { current: () => false },
      schedule: setTimeout,
      clearScheduled: clearTimeout,
    });
    expect(gesture).not.toBeNull();

    jest.advanceTimersByTime(TOUCH_LONG_PRESS_CONTEXT_MS - 1);
    expect(onLongPressContextMenu).not.toHaveBeenCalled();
    expect(createActivatedDragGesture).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onLongPressContextMenu).toHaveBeenCalledWith({
      nodeId: 1,
      client: { x: 50, y: 60 },
    });
    gesture?.end(touch(1, 50, 60));
    expect(createActivatedDragGesture).not.toHaveBeenCalled();
  });

  it("移動閾値超過で長押しをやめドラッグへ", () => {
    const onLongPressContextMenu = jest.fn();
    const innerMove = jest.fn();
    const createActivatedDragGesture = jest.fn(() => ({
      move: innerMove,
      end: jest.fn(),
      cancel: jest.fn(),
      isActivated: () => true,
    }));
    const gesture = createTouchLongPressGesture({
      nodeId: 1,
      startSample: touch(1, 0, 0),
      onLongPressContextMenuRef: { current: onLongPressContextMenu },
      createActivatedDragGesture,
      dragThreshold: 4,
      shouldAbortLongPressRef: { current: () => false },
      schedule: setTimeout,
      clearScheduled: clearTimeout,
    });
    gesture?.move(touch(1, 10, 0));
    jest.advanceTimersByTime(TOUCH_LONG_PRESS_CONTEXT_MS);
    expect(onLongPressContextMenu).not.toHaveBeenCalled();
    expect(createActivatedDragGesture).toHaveBeenCalledTimes(1);
    expect(innerMove).toHaveBeenCalled();
  });

  it("shouldAbort が真なら長押しを発火しない", () => {
    const onLongPressContextMenu = jest.fn();
    const gesture = createTouchLongPressGesture({
      nodeId: 1,
      startSample: touch(1, 0, 0),
      onLongPressContextMenuRef: { current: onLongPressContextMenu },
      createActivatedDragGesture: jest.fn(() => null),
      dragThreshold: 4,
      shouldAbortLongPressRef: { current: () => true },
      schedule: setTimeout,
      clearScheduled: clearTimeout,
    });
    jest.advanceTimersByTime(TOUCH_LONG_PRESS_CONTEXT_MS);
    expect(onLongPressContextMenu).not.toHaveBeenCalled();
    expect(gesture).not.toBeNull();
  });

  it("mouse サンプルでは null", () => {
    expect(createTouchLongPressGesture({
      nodeId: 1,
      startSample: { ...touch(1, 0, 0), pointerType: "mouse" },
      onLongPressContextMenuRef: { current: jest.fn() },
      createActivatedDragGesture: jest.fn(() => null),
      dragThreshold: 4,
      shouldAbortLongPressRef: { current: () => false },
      schedule: setTimeout,
      clearScheduled: clearTimeout,
    })).toBeNull();
  });
});