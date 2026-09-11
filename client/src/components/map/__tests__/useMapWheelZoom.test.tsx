import { renderHook } from "@testing-library/react";
import { useMapWheelZoom } from "@/components/map/useMapWheelZoom";

describe("useMapWheelZoom", () => {
  it("canvas上のwheelを抑止してcanvas相対anchorでズームする", () => {
    const canvas = document.createElement("canvas");
    jest.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 100, top: 50, width: 800, height: 600,
      right: 900, bottom: 650, x: 100, y: 50, toJSON: () => ({}),
    });
    const onBeforeZoom = jest.fn();
    const onZoomAt = jest.fn();
    const runtime = { app: { canvas, screen: { width: 800, height: 600 } } };
    renderHook(() => useMapWheelZoom({
      runtime: runtime as never,
      viewportRef: { current: { offsetX: 0, offsetY: 0, scale: 1 } },
      onBeforeZoom,
      onZoomAt,
    }));

    const event = new WheelEvent("wheel", {
      clientX: 300,
      clientY: 200,
      deltaY: -100,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      cancelable: true,
    });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onBeforeZoom).toHaveBeenCalledTimes(1);
    expect(onZoomAt).toHaveBeenCalledWith(
      { x: 200, y: 150 },
      Math.exp(0.1),
    );
  });

  it("unmount後はwheelを処理しない", () => {
    const canvas = document.createElement("canvas");
    const onZoomAt = jest.fn();
    const { unmount } = renderHook(() => useMapWheelZoom({
      runtime: { app: { canvas, screen: { height: 600 } } } as never,
      viewportRef: { current: { offsetX: 0, offsetY: 0, scale: 1 } },
      onBeforeZoom: jest.fn(),
      onZoomAt,
    }));

    unmount();
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 1 }));

    expect(onZoomAt).not.toHaveBeenCalled();
  });
});
