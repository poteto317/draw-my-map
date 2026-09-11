import { createCanvasPanGesture } from "@/components/map/pixi/canvasPanGesture";

const sample = (x: number, y: number) => ({
  pointerId: 1,
  pointerType: "mouse",
  screen: { x, y },
  world: { x, y },
});

describe("createCanvasPanGesture", () => {
  it("4px未満ではviewportを変更しない", () => {
    const onViewportChangeRef = { current: jest.fn() };
    const gesture = createCanvasPanGesture({
      startSample: sample(100, 50),
      startViewport: { offsetX: 10, offsetY: 20, scale: 1 },
      onViewportChangeRef,
      dragThreshold: 4,
    });

    gesture?.move(sample(103, 53));

    expect(onViewportChangeRef.current).not.toHaveBeenCalled();
  });

  it("開始viewportへ開始点からの総差分を適用する", () => {
    const onViewportChange = jest.fn();
    const gesture = createCanvasPanGesture({
      startSample: sample(100, 50),
      startViewport: { offsetX: 10, offsetY: 20, scale: 2 },
      onViewportChangeRef: { current: onViewportChange },
      dragThreshold: 4,
    });

    gesture?.move(sample(104, 51));
    gesture?.move(sample(110, 60));

    expect(onViewportChange.mock.calls).toEqual([
      [{ offsetX: 14, offsetY: 21, scale: 2 }],
      [{ offsetX: 20, offsetY: 30, scale: 2 }],
    ]);
  });

  it.each(["end", "cancel"] as const)("%s後のmoveを無視する", (finish) => {
    const onViewportChangeRef = { current: jest.fn() };
    const gesture = createCanvasPanGesture({
      startSample: sample(0, 0),
      startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
      onViewportChangeRef,
      dragThreshold: 4,
    });

    if (finish === "end") gesture?.end(sample(0, 0));
    else gesture?.cancel();
    gesture?.move(sample(10, 10));

    expect(onViewportChangeRef.current).not.toHaveBeenCalled();
  });

  it.each([
    sample(Number.NaN, 0),
    sample(0, Number.POSITIVE_INFINITY),
  ])("非有限の開始座標ではgestureを作らない", (startSample) => {
    expect(createCanvasPanGesture({
      startSample,
      startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
      onViewportChangeRef: { current: jest.fn() },
      dragThreshold: 4,
    })).toBeNull();
  });

  it("非有限moveを無視してdrag閾値を有効化しない", () => {
    const onViewportChangeRef = { current: jest.fn() };
    const gesture = createCanvasPanGesture({
      startSample: sample(0, 0),
      startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
      onViewportChangeRef,
      dragThreshold: 4,
    });

    gesture?.move(sample(Number.NaN, 0));
    gesture?.move(sample(1, 1));

    expect(onViewportChangeRef.current).not.toHaveBeenCalled();
  });
});
