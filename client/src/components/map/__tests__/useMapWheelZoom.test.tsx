import { renderHook } from "@testing-library/react";
import { useMapWheelZoom } from "@/components/map/useMapWheelZoom";

function defaultRuntime(canvas: HTMLCanvasElement) {
  return { app: { canvas, screen: { width: 800, height: 600 } } };
}

describe("useMapWheelZoom", () => {
  it("修飾キーなしwheelでパンしpreventDefaultとonBeforeZoomを呼ぶ", () => {
    const canvas = document.createElement("canvas");
    const onBeforeZoom = jest.fn();
    const onPanBy = jest.fn();
    const onZoomAt = jest.fn();
    renderHook(() => useMapWheelZoom({
      runtime: defaultRuntime(canvas) as never,
      viewportRef: { current: { offsetX: 0, offsetY: 0, scale: 1 } },
      onBeforeZoom,
      onPanBy,
      onZoomAt,
    }));

    const event = new WheelEvent("wheel", {
      deltaX: 0,
      deltaY: 100,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      cancelable: true,
    });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onBeforeZoom).toHaveBeenCalledTimes(1);
    expect(onPanBy).toHaveBeenCalledWith(0, -100);
    expect(onZoomAt).not.toHaveBeenCalled();
  });

  it.each([
    ["ctrlKey", { ctrlKey: true }],
    ["metaKey", { metaKey: true }],
  ])("%s付きwheelでcanvas相対anchorにズームする", (_label, modifier) => {
    const canvas = document.createElement("canvas");
    jest.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 100, top: 50, width: 800, height: 600,
      right: 900, bottom: 650, x: 100, y: 50, toJSON: () => ({}),
    });
    const onBeforeZoom = jest.fn();
    const onPanBy = jest.fn();
    const onZoomAt = jest.fn();
    renderHook(() => useMapWheelZoom({
      runtime: defaultRuntime(canvas) as never,
      viewportRef: { current: { offsetX: 0, offsetY: 0, scale: 1 } },
      onBeforeZoom,
      onPanBy,
      onZoomAt,
    }));

    const event = new WheelEvent("wheel", {
      clientX: 300,
      clientY: 200,
      deltaY: -100,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      cancelable: true,
      ...modifier,
    });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onBeforeZoom).toHaveBeenCalledTimes(1);
    expect(onZoomAt).toHaveBeenCalledWith(
      { x: 200, y: 150 },
      Math.exp(0.25),
    );
    expect(onPanBy).not.toHaveBeenCalled();
  });

  it("修飾キーなしで横スクロールのみのwheelを横パンに使う", () => {
    const canvas = document.createElement("canvas");
    const onBeforeZoom = jest.fn();
    const onPanBy = jest.fn();
    const onZoomAt = jest.fn();
    renderHook(() => useMapWheelZoom({
      runtime: defaultRuntime(canvas) as never,
      viewportRef: { current: { offsetX: 0, offsetY: 0, scale: 1 } },
      onBeforeZoom,
      onPanBy,
      onZoomAt,
    }));

    const event = new WheelEvent("wheel", {
      deltaX: 100,
      deltaY: 0,
      cancelable: true,
    });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onBeforeZoom).toHaveBeenCalledTimes(1);
    expect(onPanBy).toHaveBeenCalledWith(-100, 0);
    expect(onZoomAt).not.toHaveBeenCalled();
  });

  it("deltaがともに0のwheelでは副作用を発生させない", () => {
    const canvas = document.createElement("canvas");
    const onBeforeZoom = jest.fn();
    const onPanBy = jest.fn();
    const onZoomAt = jest.fn();
    renderHook(() => useMapWheelZoom({
      runtime: { app: { canvas, screen: { height: 600 } } } as never,
      viewportRef: { current: { offsetX: 0, offsetY: 0, scale: 1 } },
      onBeforeZoom,
      onPanBy,
      onZoomAt,
    }));

    const event = new WheelEvent("wheel", {
      deltaX: 0,
      deltaY: 0,
      cancelable: true,
    });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onBeforeZoom).not.toHaveBeenCalled();
    expect(onPanBy).not.toHaveBeenCalled();
    expect(onZoomAt).not.toHaveBeenCalled();
  });

  it.each([
    [4, -1],
    [0.25, 1],
  ])("倍率制限で変化しないCtrl+wheelではズーム副作用を起こさずページズームだけ防ぐ", (scale, deltaY) => {
    const canvas = document.createElement("canvas");
    const onBeforeZoom = jest.fn();
    const onPanBy = jest.fn();
    const onZoomAt = jest.fn();
    renderHook(() => useMapWheelZoom({
      runtime: { app: { canvas, screen: { height: 600 } } } as never,
      viewportRef: { current: { offsetX: 0, offsetY: 0, scale } },
      onBeforeZoom,
      onPanBy,
      onZoomAt,
    }));

    const event = new WheelEvent("wheel", { deltaY, ctrlKey: true, cancelable: true });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onBeforeZoom).not.toHaveBeenCalled();
    expect(onPanBy).not.toHaveBeenCalled();
    expect(onZoomAt).not.toHaveBeenCalled();
  });

  it.each([
    ["ctrlKey", { ctrlKey: true }],
    ["metaKey", { metaKey: true }],
  ])("%s付きでズーム要求が null でも preventDefault だけ行う", (_label, modifier) => {
    const canvas = document.createElement("canvas");
    const onBeforeZoom = jest.fn();
    const onPanBy = jest.fn();
    const onZoomAt = jest.fn();
    renderHook(() => useMapWheelZoom({
      runtime: { app: { canvas, screen: { height: 600 } } } as never,
      viewportRef: { current: { offsetX: 0, offsetY: 0, scale: 4 } },
      onBeforeZoom,
      onPanBy,
      onZoomAt,
    }));

    const event = new WheelEvent("wheel", { deltaY: -1, cancelable: true, ...modifier });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onBeforeZoom).not.toHaveBeenCalled();
    expect(onPanBy).not.toHaveBeenCalled();
    expect(onZoomAt).not.toHaveBeenCalled();
  });

  it("unmount後はwheelを処理しない", () => {
    const canvas = document.createElement("canvas");
    const onPanBy = jest.fn();
    const onZoomAt = jest.fn();
    const { unmount } = renderHook(() => useMapWheelZoom({
      runtime: { app: { canvas, screen: { height: 600 } } } as never,
      viewportRef: { current: { offsetX: 0, offsetY: 0, scale: 1 } },
      onBeforeZoom: jest.fn(),
      onPanBy,
      onZoomAt,
    }));

    unmount();
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 1 }));

    expect(onPanBy).not.toHaveBeenCalled();
    expect(onZoomAt).not.toHaveBeenCalled();
  });
});