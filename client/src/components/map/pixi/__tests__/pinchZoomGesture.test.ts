import { createPinchZoomGesture } from "@/components/map/pixi/pinchZoomGesture";

const touch = (pointerId: number, x: number, y: number) => ({
  pointerId,
  pointerType: "touch",
  screen: { x, y },
  world: { x, y },
});

describe("createPinchZoomGesture", () => {
  it("距離比で拡大し開始中点のワールド座標を現在中点へ移す", () => {
    const onViewportChangeRef = { current: jest.fn() };
    const gesture = createPinchZoomGesture({
      first: touch(1, 100, 100),
      second: touch(2, 200, 100),
      startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
      onViewportChangeRef,
    });

    gesture.move(touch(1, 100, 120));
    gesture.move(touch(2, 300, 120));

    expect(onViewportChangeRef.current).toHaveBeenLastCalledWith({
      offsetX: -100,
      offsetY: -80,
      scale: 2,
    });
  });

  it("倍率制限後に実効viewportが変わらないmoveを重複通知しない", () => {
    const onViewportChangeRef = { current: jest.fn() };
    const gesture = createPinchZoomGesture({
      first: touch(1, 0, 0),
      second: touch(2, 100, 0),
      startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
      onViewportChangeRef,
    });

    gesture.move(touch(2, 500, 0));
    expect(onViewportChangeRef.current).toHaveBeenCalledTimes(1);

    gesture.move(touch(2, 500, 0));

    expect(onViewportChangeRef.current).toHaveBeenCalledTimes(1);
  });

  it("3本目のtouchを所有せず計算へ使わない", () => {
    const onViewportChangeRef = { current: jest.fn() };
    const gesture = createPinchZoomGesture({
      first: touch(1, 0, 0),
      second: touch(2, 100, 0),
      startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
      onViewportChangeRef,
    });

    expect(gesture.owns(3)).toBe(false);
    gesture.move(touch(3, 500, 500));

    expect(onViewportChangeRef.current).not.toHaveBeenCalled();
  });

  it("所有pointer終了後のmoveを無視する", () => {
    const onViewportChangeRef = { current: jest.fn() };
    const gesture = createPinchZoomGesture({
      first: touch(1, 0, 0),
      second: touch(2, 100, 0),
      startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
      onViewportChangeRef,
    });

    expect(gesture.end(1)).toBe(true);
    gesture.move(touch(2, 200, 0));

    expect(onViewportChangeRef.current).not.toHaveBeenCalled();
  });

  it("開始距離がゼロならviewportを更新しない", () => {
    const onViewportChangeRef = { current: jest.fn() };
    const gesture = createPinchZoomGesture({
      first: touch(1, 100, 100),
      second: touch(2, 100, 100),
      startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
      onViewportChangeRef,
    });

    gesture.move(touch(2, 200, 100));

    expect(onViewportChangeRef.current).not.toHaveBeenCalled();
  });

  it("開始距離がゼロでも最初の正距離を基準に次のmoveからズームする", () => {
    const onViewportChangeRef = { current: jest.fn() };
    const gesture = createPinchZoomGesture({
      first: touch(1, 100, 100),
      second: touch(2, 100, 100),
      startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
      onViewportChangeRef,
    });

    gesture.move(touch(2, 200, 100));
    expect(onViewportChangeRef.current).not.toHaveBeenCalled();

    gesture.move(touch(2, 300, 100));

    expect(onViewportChangeRef.current).toHaveBeenCalledWith({
      offsetX: -100,
      offsetY: -100,
      scale: 2,
    });
  });

  it("非有限moveを無視して最初の有限な正距離から復旧する", () => {
    const onViewportChangeRef = { current: jest.fn() };
    const gesture = createPinchZoomGesture({
      first: touch(1, 100, 100),
      second: touch(2, 100, 100),
      startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
      onViewportChangeRef,
    });

    gesture.move(touch(2, Number.NaN, 100));
    gesture.move(touch(2, 200, 100));
    expect(onViewportChangeRef.current).not.toHaveBeenCalled();

    gesture.move(touch(2, 300, 100));

    expect(onViewportChangeRef.current).toHaveBeenCalledWith({
      offsetX: -100,
      offsetY: -100,
      scale: 2,
    });
  });
});
