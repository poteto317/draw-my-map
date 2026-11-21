import { renderHook } from "@testing-library/react";
import { useMapWheelZoom } from "@/components/map/useMapWheelZoom";
import { DEFAULT_WHEEL_ZOOM_SENSITIVITY } from "@/domain/uiPrefs/uiPrefs";

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
      wheelZoomSensitivity: DEFAULT_WHEEL_ZOOM_SENSITIVITY,
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
      wheelZoomSensitivity: DEFAULT_WHEEL_ZOOM_SENSITIVITY,
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

  it("感度を上げると同じホイール入力でより大きくズームする", () => {
    const canvas = document.createElement("canvas");
    jest.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 800, height: 600,
      right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
    });
    const onZoomAt = jest.fn();
    renderHook(() => useMapWheelZoom({
      runtime: defaultRuntime(canvas) as never,
      viewportRef: { current: { offsetX: 0, offsetY: 0, scale: 1 } },
      wheelZoomSensitivity: 0.005,
      onBeforeZoom: jest.fn(),
      onPanBy: jest.fn(),
      onZoomAt,
    }));

    canvas.dispatchEvent(new WheelEvent("wheel", {
      clientX: 100,
      clientY: 100,
      deltaY: -100,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      cancelable: true,
      ctrlKey: true,
    }));

    expect(onZoomAt).toHaveBeenCalledWith(
      { x: 100, y: 100 },
      Math.exp(0.5),
    );
  });

  it("修飾キーなしで横スクロールのみのwheelを横パンに使う", () => {
    const canvas = document.createElement("canvas");
    const onBeforeZoom = jest.fn();
    const onPanBy = jest.fn();
    const onZoomAt = jest.fn();
    renderHook(() => useMapWheelZoom({
      runtime: defaultRuntime(canvas) as never,
      viewportRef: { current: { offsetX: 0, offsetY: 0, scale: 1 } },
      wheelZoomSensitivity: DEFAULT_WHEEL_ZOOM_SENSITIVITY,
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
      wheelZoomSensitivity: DEFAULT_WHEEL_ZOOM_SENSITIVITY,
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
      wheelZoomSensitivity: DEFAULT_WHEEL_ZOOM_SENSITIVITY,
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
      wheelZoomSensitivity: DEFAULT_WHEEL_ZOOM_SENSITIVITY,
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
      wheelZoomSensitivity: DEFAULT_WHEEL_ZOOM_SENSITIVITY,
      onBeforeZoom: jest.fn(),
      onPanBy,
      onZoomAt,
    }));

    unmount();
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 1 }));

    expect(onPanBy).not.toHaveBeenCalled();
    expect(onZoomAt).not.toHaveBeenCalled();
  });

  it("mount後に感度を変えると次のCtrl+wheelに新しい感度が使われる", () => {
    const canvas = document.createElement("canvas");
    jest.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 800, height: 600,
      right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
    });
    const onZoomAt = jest.fn();
    const { rerender } = renderHook(
      ({ sensitivity }) => useMapWheelZoom({
        runtime: defaultRuntime(canvas) as never,
        viewportRef: { current: { offsetX: 0, offsetY: 0, scale: 1 } },
        wheelZoomSensitivity: sensitivity,
        onBeforeZoom: jest.fn(),
        onPanBy: jest.fn(),
        onZoomAt,
      }),
      { initialProps: { sensitivity: DEFAULT_WHEEL_ZOOM_SENSITIVITY } },
    );

    const fireZoom = () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 100,
        clientY: 100,
        deltaY: -100,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        cancelable: true,
        ctrlKey: true,
      }));
    };

    fireZoom();
    expect(onZoomAt).toHaveBeenLastCalledWith({ x: 100, y: 100 }, Math.exp(0.25));

    rerender({ sensitivity: 0.005 });
    fireZoom();
    expect(onZoomAt).toHaveBeenLastCalledWith({ x: 100, y: 100 }, Math.exp(0.5));
  });
});