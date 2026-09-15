import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";
import type { PointerSample } from "@/components/map/pixi/pointerGesture";
import { createTouchGestureCoordinator } from "@/components/map/pixi/touchGestureCoordinator";

function touch(pointerId: number, x: number, y: number): PointerSample {
  return {
    pointerId,
    pointerType: "touch",
    screen: { x, y },
    world: { x, y },
  };
}

function createCoordinator(beforePinch: () => boolean = () => true) {
  const onBeforePinch = jest.fn(beforePinch);
  const onViewportChangeRef = { current: jest.fn() };
  const coordinator = createTouchGestureCoordinator({
    viewportRef: { current: INITIAL_VIEWPORT },
    onViewportChangeRef,
    onBeforePinch,
  });
  return { coordinator, onBeforePinch, onViewportChangeRef };
}

describe("createTouchGestureCoordinator", () => {
  it("最初のtouchを通常gestureへ委ね、2本目からpinchを所有する", () => {
    const { coordinator, onBeforePinch } = createCoordinator();

    expect(coordinator.pointerDown(touch(1, 0, 0))).toBe(false);
    expect(coordinator.pointerDown(touch(2, 100, 0))).toBe(true);

    expect(onBeforePinch).toHaveBeenCalledTimes(1);
    expect(coordinator.hasActivePinch()).toBe(true);
  });

  it("固定した2本の現在位置だけでviewportを更新する", () => {
    const { coordinator, onViewportChangeRef } = createCoordinator();
    coordinator.pointerDown(touch(1, 0, 0));
    coordinator.pointerDown(touch(2, 100, 0));

    expect(coordinator.pointerMove(touch(2, 200, 0))).toBe(true);
    expect(onViewportChangeRef.current).toHaveBeenLastCalledWith({
      offsetX: 0,
      offsetY: 0,
      scale: 2,
    });
  });

  it("3本目を所有するが固定済みpairを置換しない", () => {
    const { coordinator, onViewportChangeRef } = createCoordinator();
    coordinator.pointerDown(touch(1, 0, 0));
    coordinator.pointerDown(touch(2, 100, 0));
    expect(coordinator.pointerDown(touch(3, 500, 500))).toBe(true);
    onViewportChangeRef.current.mockClear();

    expect(coordinator.pointerMove(touch(3, 600, 600))).toBe(true);
    expect(onViewportChangeRef.current).not.toHaveBeenCalled();
  });

  it("pinch終了後は全touchが離れるまで通常gestureを抑止する", () => {
    const { coordinator } = createCoordinator();
    coordinator.pointerDown(touch(1, 0, 0));
    coordinator.pointerDown(touch(2, 100, 0));

    coordinator.pointerUp(touch(2, 100, 0));
    expect(coordinator.hasActivePinch()).toBe(false);
    expect(coordinator.pointerMove(touch(1, 20, 0))).toBe(true);
    expect(coordinator.pointerDown(touch(1, 20, 0))).toBe(true);

    coordinator.pointerUp(touch(1, 20, 0));
    expect(coordinator.pointerDown(touch(4, 0, 0))).toBe(false);
  });

  it("cancelはpinchだけを終了し、resetは登録touchも破棄する", () => {
    const { coordinator, onBeforePinch } = createCoordinator();
    coordinator.pointerDown(touch(1, 0, 0));
    coordinator.pointerDown(touch(2, 100, 0));

    coordinator.cancel();
    expect(coordinator.hasActivePinch()).toBe(false);

    coordinator.reset();
    expect(coordinator.pointerDown(touch(3, 0, 0))).toBe(false);
    expect(onBeforePinch).toHaveBeenCalledTimes(1);
  });

  it("cancel後は全touch解放まで新しいpinch pairを作らない", () => {
    const { coordinator, onBeforePinch } = createCoordinator();
    coordinator.pointerDown(touch(1, 0, 0));
    coordinator.pointerDown(touch(2, 100, 0));

    coordinator.cancel();
    coordinator.pointerUp(touch(2, 100, 0));
    expect(coordinator.pointerDown(touch(3, 200, 0))).toBe(true);

    expect(coordinator.hasActivePinch()).toBe(false);
    expect(onBeforePinch).toHaveBeenCalledTimes(1);

    coordinator.pointerUp(touch(1, 0, 0));
    coordinator.pointerUp(touch(3, 200, 0));
    expect(coordinator.pointerDown(touch(4, 0, 0))).toBe(false);
  });

  it("mouse入力は所有しない", () => {
    const { coordinator } = createCoordinator();
    const mouse = { ...touch(1, 0, 0), pointerType: "mouse" };

    expect(coordinator.pointerDown(mouse)).toBe(false);
    expect(coordinator.pointerMove(mouse)).toBe(false);
    coordinator.pointerUp(mouse);
  });

  it.each(["mouse", "pen"])("pinch中は%s入力を通常gestureへ渡さない", (pointerType) => {
    const { coordinator } = createCoordinator();
    coordinator.pointerDown(touch(1, 0, 0));
    coordinator.pointerDown(touch(2, 100, 0));

    expect(coordinator.pointerDown({
      ...touch(3, 50, 50),
      pointerType,
    })).toBe(true);
  });

  it("pointerDownを受けていないtouch moveを追跡集合へ登録しない", () => {
    const { coordinator, onBeforePinch } = createCoordinator();

    expect(coordinator.pointerMove(touch(99, 500, 500))).toBe(false);
    expect(coordinator.pointerDown(touch(1, 0, 0))).toBe(false);
    coordinator.pointerUp(touch(1, 0, 0));

    expect(coordinator.pointerDown(touch(2, 100, 0))).toBe(false);
    expect(onBeforePinch).not.toHaveBeenCalled();
    expect(coordinator.hasActivePinch()).toBe(false);
  });

  it("pinch開始callback中のresetで失効したtouch pairを使用しない", () => {
    const holder: { coordinator?: ReturnType<typeof createTouchGestureCoordinator> } = {};
    const result = createCoordinator(() => {
      holder.coordinator?.reset();
      return true;
    });
    const coordinator = result.coordinator;
    holder.coordinator = coordinator;
    coordinator.pointerDown(touch(1, 0, 0));

    expect(() => coordinator.pointerDown(touch(2, 100, 0))).not.toThrow();
    expect(coordinator.hasActivePinch()).toBe(false);
  });

  it("pinch開始callbackから再入して作られたpinchを外側の開始で上書きしない", () => {
    let reentered = false;
    const holder: { coordinator?: ReturnType<typeof createTouchGestureCoordinator> } = {};
    const result = createCoordinator(() => {
      if (reentered) return true;
      reentered = true;
      const coordinator = holder.coordinator!;
      coordinator.pointerUp(touch(1, 0, 0));
      coordinator.pointerUp(touch(2, 100, 0));
      coordinator.pointerDown(touch(1, 0, 0));
      coordinator.pointerDown(touch(2, 200, 0));
      coordinator.pointerMove(touch(2, 400, 0));
      return true;
    });
    const coordinator = result.coordinator;
    holder.coordinator = coordinator;
    coordinator.pointerDown(touch(1, 0, 0));

    coordinator.pointerDown(touch(2, 100, 0));
    result.onViewportChangeRef.current.mockClear();
    coordinator.pointerMove(touch(2, 600, 0));

    expect(result.onViewportChangeRef.current).toHaveBeenCalledWith({
      offsetX: 0,
      offsetY: 0,
      scale: 3,
    });
  });
});
