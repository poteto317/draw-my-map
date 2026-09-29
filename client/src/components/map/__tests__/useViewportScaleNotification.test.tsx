import { renderHook } from "@testing-library/react";
import { useViewportScaleNotification } from "@/components/map/useViewportScaleNotification";

describe("useViewportScaleNotification", () => {
  it("初回scaleを通知し、callback差し替えだけでは再通知しない", () => {
    const firstCallback = jest.fn();
    const secondCallback = jest.fn();
    const { rerender } = renderHook(
      ({ scale, callback }) => useViewportScaleNotification(scale, callback),
      { initialProps: { scale: 1, callback: firstCallback } },
    );

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(firstCallback).toHaveBeenCalledWith(1);

    rerender({ scale: 1, callback: secondCallback });

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).not.toHaveBeenCalled();
  });

  it("次のscale変更を最新callbackへ通知する", () => {
    const firstCallback = jest.fn();
    const secondCallback = jest.fn();
    const { rerender } = renderHook(
      ({ scale, callback }) => useViewportScaleNotification(scale, callback),
      { initialProps: { scale: 1, callback: firstCallback } },
    );

    rerender({ scale: 1, callback: secondCallback });
    rerender({ scale: 2, callback: secondCallback });

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenCalledWith(2);
  });
});
