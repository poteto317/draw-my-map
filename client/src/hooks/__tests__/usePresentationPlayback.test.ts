import { act, renderHook } from "@testing-library/react";
import { usePresentationPlayback } from "@/hooks/usePresentationPlayback";
import type { MapTour } from "@/types/mapTour";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";

function view(offsetX: number): MapViewSnapshot {
  return {
    viewport: { offsetX, offsetY: 0, scale: 1 },
    selectedNodeId: null,
    selectedNodeIds: [],
    focusRootId: null,
    collapsedNodeIds: [],
    resolutionMode: "auto",
    autoResolutionLevel: "all",
  };
}

function tourWithSteps(steps: Array<{ id: string; offsetX: number; caption?: string }>): MapTour {
  return {
    version: 1,
    title: "案内",
    steps: steps.map(({ id, offsetX, caption }) => ({
      id,
      snapshot: view(offsetX),
      ...(caption === undefined ? {} : { caption }),
    })),
  };
}

describe("usePresentationPlayback", () => {
  it("開始で先頭を applyView のみ適用し、前後・終了も第2引数なし", () => {
    const applyView = jest.fn(() => true);
    const captureView = jest.fn(() => view(99));
    const { result } = renderHook(() => usePresentationPlayback({
      tour: tourWithSteps([
        { id: "a", offsetX: 10 },
        { id: "b", offsetX: 20 },
      ]),
      startBlocked: false,
      captureView,
      applyView,
    }));

    act(() => result.current.start());
    expect(captureView).toHaveBeenCalledTimes(1);
    expect(applyView).toHaveBeenCalledWith(view(10));
    applyView.mock.calls.forEach((call) => expect(call).toHaveLength(1));

    act(() => result.current.goForward());
    expect(applyView).toHaveBeenLastCalledWith(view(20));

    act(() => result.current.goBack());
    expect(applyView).toHaveBeenLastCalledWith(view(10));

    act(() => expect(result.current.end()).toBe(true));
    expect(applyView).toHaveBeenLastCalledWith(view(99));
    applyView.mock.calls.forEach((call) => expect(call).toHaveLength(1));
    expect(result.current.screen).toBe("closed");
  });

  it("end が baseline 復元に失敗したら playing を維持する", () => {
    const applyView = jest.fn((snap: MapViewSnapshot) => snap.viewport.offsetX !== 99);
    const captureView = jest.fn(() => view(99));
    const { result } = renderHook(() => usePresentationPlayback({
      tour: tourWithSteps([{ id: "a", offsetX: 10 }]),
      startBlocked: false,
      captureView,
      applyView,
    }));

    act(() => expect(result.current.start()).toBe(true));
    act(() => expect(result.current.end()).toBe(false));
    expect(result.current.screen).toBe("playing");

    applyView.mockImplementation(() => true);
    act(() => expect(result.current.end()).toBe(true));
    expect(result.current.screen).toBe("closed");
  });

  it("steps0 または startBlocked では開始できない", () => {
    const applyView = jest.fn(() => true);
    const empty = renderHook(() => usePresentationPlayback({
      tour: undefined,
      startBlocked: false,
      captureView: () => view(0),
      applyView,
    }));
    act(() => expect(empty.result.current.start()).toBe(false));

    const blocked = renderHook(() => usePresentationPlayback({
      tour: tourWithSteps([{ id: "a", offsetX: 0 }]),
      startBlocked: true,
      captureView: () => view(0),
      applyView,
    }));
    act(() => expect(blocked.result.current.start()).toBe(false));
    expect(applyView).not.toHaveBeenCalled();
  });

  it("端では前後が拒否される", () => {
    const applyView = jest.fn(() => true);
    const { result } = renderHook(() => usePresentationPlayback({
      tour: tourWithSteps([{ id: "a", offsetX: 0 }]),
      startBlocked: false,
      captureView: () => view(0),
      applyView,
    }));
    act(() => result.current.start());
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
    act(() => expect(result.current.goBack()).toBe(false));
    act(() => expect(result.current.goForward()).toBe(false));
  });

  it("同一 tick の二重 start は baseline を上書きしない", () => {
    const applyView = jest.fn(() => true);
    const captureView = jest.fn(() => view(99));
    const { result } = renderHook(() => usePresentationPlayback({
      tour: tourWithSteps([{ id: "a", offsetX: 10 }]),
      startBlocked: false,
      captureView,
      applyView,
    }));

    let first: boolean;
    let second: boolean;
    act(() => {
      first = result.current.start();
      second = result.current.start();
    });
    expect(first!).toBe(true);
    expect(second!).toBe(false);
    expect(captureView).toHaveBeenCalledTimes(1);

    act(() => result.current.end());
    expect(applyView).toHaveBeenLastCalledWith(view(99));
  });

  it("applyView が false なら playing に入らない", () => {
    const applyView = jest.fn(() => false);
    const captureView = jest.fn(() => view(99));
    const { result } = renderHook(() => usePresentationPlayback({
      tour: tourWithSteps([{ id: "a", offsetX: 10 }]),
      startBlocked: false,
      captureView,
      applyView,
    }));

    act(() => expect(result.current.start()).toBe(false));
    expect(result.current.screen).toBe("closed");
    expect(result.current.canStart).toBe(true);

    applyView.mockImplementation(() => true);
    act(() => expect(result.current.start()).toBe(true));
    expect(result.current.screen).toBe("playing");
  });

  it("goForward が applyView 失敗時は stepIndex を進めない", () => {
    let callIndex = 0;
    const applyView = jest.fn(() => {
      callIndex += 1;
      return callIndex !== 2;
    });
    const { result } = renderHook(() => usePresentationPlayback({
      tour: tourWithSteps([
        { id: "a", offsetX: 0 },
        { id: "b", offsetX: 10 },
      ]),
      startBlocked: false,
      captureView: () => view(0),
      applyView,
    }));

    act(() => expect(result.current.start()).toBe(true));
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.currentStep?.id).toBe("a");

    act(() => expect(result.current.goForward()).toBe(false));
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.currentStep?.id).toBe("a");
    expect(result.current.canGoForward).toBe(true);
  });

  it("goBack が applyView 失敗時は stepIndex を戻さない", () => {
    const applyView = jest.fn(() => true);
    const { result } = renderHook(() => usePresentationPlayback({
      tour: tourWithSteps([
        { id: "a", offsetX: 0 },
        { id: "b", offsetX: 20 },
      ]),
      startBlocked: false,
      captureView: () => view(0),
      applyView,
    }));

    act(() => result.current.start());
    act(() => expect(result.current.goForward()).toBe(true));
    expect(result.current.stepIndex).toBe(1);

    applyView.mockImplementation(() => false);
    act(() => expect(result.current.goBack()).toBe(false));
    expect(result.current.stepIndex).toBe(1);
    expect(result.current.currentStep?.id).toBe("b");
    expect(result.current.canGoBack).toBe(true);
  });

  it("再生中に steps が縮むと stepIndex をクランプする", () => {
    const applyView = jest.fn(() => true);
    const initialTour = tourWithSteps([
      { id: "a", offsetX: 0 },
      { id: "b", offsetX: 10 },
      { id: "c", offsetX: 20 },
    ]);
    const { result, rerender } = renderHook(
      ({ tour }) => usePresentationPlayback({
        tour,
        startBlocked: false,
        captureView: () => view(0),
        applyView,
      }),
      { initialProps: { tour: initialTour } },
    );
    act(() => result.current.start());
    act(() => result.current.goForward());
    act(() => result.current.goForward());
    expect(result.current.stepIndex).toBe(2);

    rerender({
      tour: tourWithSteps([
        { id: "a", offsetX: 0 },
        { id: "b", offsetX: 10 },
      ]),
    });
    expect(result.current.stepIndex).toBe(1);
    expect(result.current.currentStep?.id).toBe("b");
    expect(applyView).toHaveBeenLastCalledWith(view(10));
  });

  it("再生中に steps が 0 になると終了する", () => {
    const applyView = jest.fn(() => true);
    const captureView = jest.fn(() => view(42));
    const { result, rerender } = renderHook(
      ({ tour }) => usePresentationPlayback({
        tour,
        startBlocked: false,
        captureView,
        applyView,
      }),
      { initialProps: { tour: tourWithSteps([{ id: "a", offsetX: 0 }]) } },
    );
    act(() => result.current.start());
    rerender({ tour: { version: 1, title: "案内", steps: [] } });
    expect(result.current.screen).toBe("closed");
    expect(applyView).toHaveBeenLastCalledWith(view(42));
  });

  it("再生中の currentStep とキャプションを返す", () => {
    const { result } = renderHook(() => usePresentationPlayback({
      tour: tourWithSteps([
        { id: "a", offsetX: 0, caption: "こんにちは" },
        { id: "b", offsetX: 1 },
      ]),
      startBlocked: false,
      captureView: () => view(0),
      applyView: () => true,
    }));
    act(() => result.current.start());
    expect(result.current.currentStep?.caption).toBe("こんにちは");
    act(() => result.current.goForward());
    expect(result.current.currentStep?.caption).toBeUndefined();
  });
});