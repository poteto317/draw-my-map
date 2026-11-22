import { renderHook } from "@testing-library/react";
import { useViewportFrameNotification } from "@/components/map/useViewportFrameNotification";
import { INITIAL_VIEWPORT } from "@/types/viewport";

const screen = { width: 400, height: 300 };

describe("useViewportFrameNotification", () => {
  it("screen がある初回フレームを通知し、callback差し替えだけでは再通知しない", () => {
    const firstCallback = jest.fn();
    const secondCallback = jest.fn();
    const { rerender } = renderHook(
      ({ viewport, screenSize, callback }) => (
        useViewportFrameNotification(viewport, screenSize, callback)
      ),
      {
        initialProps: {
          viewport: INITIAL_VIEWPORT,
          screenSize: screen,
          callback: firstCallback,
        },
      },
    );

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(firstCallback).toHaveBeenCalledWith({ viewport: INITIAL_VIEWPORT, screen });

    rerender({ viewport: INITIAL_VIEWPORT, screenSize: screen, callback: secondCallback });
    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).not.toHaveBeenCalled();
  });

  it("viewport 変更を最新 callback へ通知する", () => {
    const callback = jest.fn();
    const { rerender } = renderHook(
      ({ viewport, screenSize, callback: cb }) => (
        useViewportFrameNotification(viewport, screenSize, cb)
      ),
      {
        initialProps: {
          viewport: INITIAL_VIEWPORT,
          screenSize: screen,
          callback,
        },
      },
    );

    const next = { offsetX: -10, offsetY: -20, scale: 1.5 };
    rerender({ viewport: next, screenSize: screen, callback });

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ viewport: next, screen });
  });

  it("screen が null の間は通知しない", () => {
    const callback = jest.fn();
    renderHook(() => useViewportFrameNotification(INITIAL_VIEWPORT, null, callback));
    expect(callback).not.toHaveBeenCalled();
  });
});
