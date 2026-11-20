import { renderHook } from "@testing-library/react";
import { useCommandPaletteShortcut } from "@/components/map/useCommandPaletteShortcut";

function createKeyEvent(
  overrides: Partial<KeyboardEventInit> & { target?: EventTarget | null } = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "k",
    ctrlKey: true,
    cancelable: true,
    ...overrides,
  });
  if (overrides.target !== undefined) {
    Object.defineProperty(event, "target", { value: overrides.target });
  }
  return event;
}

describe("useCommandPaletteShortcut", () => {
  it("enabled=true のとき Ctrl/Cmd+K で onOpen を呼び preventDefault する", () => {
    const onOpen = jest.fn();
    renderHook(() => useCommandPaletteShortcut({ enabled: true, onOpen }));

    const ctrl = createKeyEvent({ ctrlKey: true, metaKey: false });
    window.dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);

    const meta = createKeyEvent({ ctrlKey: false, metaKey: true, key: "K" });
    window.dispatchEvent(meta);
    expect(meta.defaultPrevented).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("enabled=false のときは発火しない", () => {
    const onOpen = jest.fn();
    renderHook(() => useCommandPaletteShortcut({ enabled: false, onOpen }));

    const event = createKeyEvent();
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("Ctrl+K 以外では発火しない（Shift 付き・編集可能要素・IME）", () => {
    const onOpen = jest.fn();
    renderHook(() => useCommandPaletteShortcut({ enabled: true, onOpen }));

    window.dispatchEvent(createKeyEvent({ shiftKey: true }));
    window.dispatchEvent(createKeyEvent({ isComposing: true }));
    const input = document.createElement("input");
    window.dispatchEvent(createKeyEvent({ target: input }));

    expect(onOpen).not.toHaveBeenCalled();
  });
});
