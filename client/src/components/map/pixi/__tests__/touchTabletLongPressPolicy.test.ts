import type { PointerSample } from "@/components/map/pixi/pointerGesture";
import { createTouchGestureCoordinator } from "@/components/map/pixi/touchGestureCoordinator";
import { canStartTouchLongPressContext } from "@/components/map/pixi/touchTabletLongPressPolicy";
import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";

function touch(pointerId: number, x: number, y: number): PointerSample {
  return {
    pointerId,
    pointerType: "touch",
    screen: { x, y },
    world: { x, y },
  };
}

describe("canStartTouchLongPressContext", () => {
  it("2 本指登録後は長押しコンテキストを開始しない（coordinator 契約）", () => {
    const coordinator = createTouchGestureCoordinator({
      viewportRef: { current: INITIAL_VIEWPORT },
      onViewportChangeRef: { current: jest.fn() },
      onBeforePinch: () => true,
    });
    expect(canStartTouchLongPressContext(coordinator, 0)).toBe(true);
    coordinator.pointerDown(touch(1, 0, 0));
    expect(canStartTouchLongPressContext(coordinator, 1)).toBe(true);
    coordinator.pointerDown(touch(2, 100, 0));
    expect(canStartTouchLongPressContext(coordinator, 2)).toBe(false);
    expect(coordinator.hasActivePinch()).toBe(true);
    expect(canStartTouchLongPressContext(coordinator, 2)).toBe(false);
  });
});