import { act, renderHook } from "@testing-library/react";
import { usePresentationPlaybackKeyboard } from "@/hooks/usePresentationPlaybackKeyboard";

type KeyboardOptions = Parameters<typeof usePresentationPlaybackKeyboard>[0];

function dispatchKey(key: string): { preventDefault: jest.SpyInstance } {
  const event = new KeyboardEvent("keydown", { key, cancelable: true });
  const preventDefault = jest.spyOn(event, "preventDefault");
  act(() => {
    window.dispatchEvent(event);
  });
  return { preventDefault };
}

function mountKeyboard(initial: KeyboardOptions) {
  const { rerender } = renderHook(
    (props: KeyboardOptions) => usePresentationPlaybackKeyboard(props),
    { initialProps: initial },
  );
  return { rerender };
}

describe("usePresentationPlaybackKeyboard", () => {
  it("無効時はキー操作を無視する", () => {
    const onEnd = jest.fn();
    renderHook(() => usePresentationPlaybackKeyboard({
      enabled: false,
      canGoBack: true,
      canGoForward: true,
      onBack: jest.fn(),
      onForward: jest.fn(),
      onEnd,
    }));
    dispatchKey("Escape");
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("Escape は preventDefault して終了する", () => {
    const onEnd = jest.fn();
    mountKeyboard({
      enabled: true,
      canGoBack: true,
      canGoForward: true,
      onBack: jest.fn(),
      onForward: jest.fn(),
      onEnd,
    });
    const { preventDefault } = dispatchKey("Escape");
    expect(preventDefault).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("ArrowLeft は canGoBack のときだけ preventDefault して戻る", () => {
    const onBack = jest.fn();
    const { rerender } = mountKeyboard({
      enabled: true,
      canGoBack: true,
      canGoForward: false,
      onBack,
      onForward: jest.fn(),
      onEnd: jest.fn(),
    });
    const allowed = dispatchKey("ArrowLeft");
    expect(allowed.preventDefault).toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);

    onBack.mockClear();
    rerender({
      enabled: true,
      canGoBack: false,
      canGoForward: true,
      onBack,
      onForward: jest.fn(),
      onEnd: jest.fn(),
    });
    const blocked = dispatchKey("ArrowLeft");
    expect(blocked.preventDefault).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("ArrowRight は canGoForward のときだけ preventDefault して進む", () => {
    const onForward = jest.fn();
    const { rerender } = mountKeyboard({
      enabled: true,
      canGoBack: false,
      canGoForward: true,
      onBack: jest.fn(),
      onForward,
      onEnd: jest.fn(),
    });
    const allowed = dispatchKey("ArrowRight");
    expect(allowed.preventDefault).toHaveBeenCalled();
    expect(onForward).toHaveBeenCalledTimes(1);

    onForward.mockClear();
    rerender({
      enabled: true,
      canGoBack: true,
      canGoForward: false,
      onBack: jest.fn(),
      onForward,
      onEnd: jest.fn(),
    });
    const blocked = dispatchKey("ArrowRight");
    expect(blocked.preventDefault).not.toHaveBeenCalled();
    expect(onForward).not.toHaveBeenCalled();
  });
});