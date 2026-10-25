import { fireEvent, renderHook } from "@testing-library/react";
import {
  useSiblingReorderDragEscape,
  type UseSiblingReorderDragEscapeOptions,
} from "@/components/map/useSiblingReorderDragEscape";

function createOptions(
  overrides: Partial<UseSiblingReorderDragEscapeOptions> = {},
): UseSiblingReorderDragEscapeOptions {
  return {
    isSiblingReorderActive: () => true,
    cancelActiveGesture: jest.fn(),
    ...overrides,
  };
}

describe("useSiblingReorderDragEscape", () => {
  it("並べ替えの途中の Escape で中止し preventDefault する", () => {
    const options = createOptions();
    renderHook(() => useSiblingReorderDragEscape(options));

    const notPrevented = fireEvent.keyDown(window, { key: "Escape" });

    expect(notPrevented).toBe(false);
    expect(options.cancelActiveGesture).toHaveBeenCalledTimes(1);
  });

  it("並べ替えの途中でなければ何もしない", () => {
    const options = createOptions({ isSiblingReorderActive: () => false });
    renderHook(() => useSiblingReorderDragEscape(options));

    const notPrevented = fireEvent.keyDown(window, { key: "Escape" });

    expect(notPrevented).toBe(true);
    expect(options.cancelActiveGesture).not.toHaveBeenCalled();
  });

  it("Escape 以外のキーでは何もしない", () => {
    const options = createOptions();
    renderHook(() => useSiblingReorderDragEscape(options));

    const notPrevented = fireEvent.keyDown(window, { key: "Enter" });

    expect(notPrevented).toBe(true);
    expect(options.cancelActiveGesture).not.toHaveBeenCalled();
  });

  it("IME の変換中（isComposing）は何もしない", () => {
    const options = createOptions();
    renderHook(() => useSiblingReorderDragEscape(options));

    const notPrevented = fireEvent.keyDown(window, { key: "Escape", isComposing: true });

    expect(notPrevented).toBe(true);
    expect(options.cancelActiveGesture).not.toHaveBeenCalled();
  });

  it("IME の変換中（keyCode 229）は何もしない", () => {
    const options = createOptions();
    renderHook(() => useSiblingReorderDragEscape(options));

    const notPrevented = fireEvent.keyDown(window, { key: "Escape", keyCode: 229 });

    expect(notPrevented).toBe(true);
    expect(options.cancelActiveGesture).not.toHaveBeenCalled();
  });

  it("isSiblingReorderActive を keydown の時点で呼ぶ", () => {
    let active = false;
    const options = createOptions({ isSiblingReorderActive: () => active });
    renderHook(() => useSiblingReorderDragEscape(options));

    active = true;
    const notPrevented = fireEvent.keyDown(window, { key: "Escape" });

    expect(notPrevented).toBe(false);
    expect(options.cancelActiveGesture).toHaveBeenCalledTimes(1);
  });

  it("描画し直した後は最新の options を使い、登録は1回だけ", () => {
    const addEventListener = jest.spyOn(window, "addEventListener");
    const first = createOptions({ isSiblingReorderActive: () => false });
    const second = createOptions();
    const { rerender } = renderHook(
      (props: UseSiblingReorderDragEscapeOptions) => useSiblingReorderDragEscape(props),
      { initialProps: first },
    );

    rerender(second);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(first.cancelActiveGesture).not.toHaveBeenCalled();
    expect(second.cancelActiveGesture).toHaveBeenCalledTimes(1);
    expect(addEventListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    addEventListener.mockRestore();
  });
});
