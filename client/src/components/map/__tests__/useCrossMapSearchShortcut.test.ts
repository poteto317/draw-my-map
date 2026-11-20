import { renderHook } from "@testing-library/react";
import {
  isCrossMapSearchShortcut,
  useCrossMapSearchShortcut,
} from "@/components/map/useCrossMapSearchShortcut";

function createKeyEvent(
  overrides: Partial<KeyboardEventInit> & { target?: EventTarget | null } = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "f",
    shiftKey: true,
    ctrlKey: true,
    cancelable: true,
    ...overrides,
  });
  if (overrides.target !== undefined) {
    Object.defineProperty(event, "target", { value: overrides.target });
  }
  return event;
}

describe("isCrossMapSearchShortcut", () => {
  it("Ctrl+Shift+F および Cmd+Shift+F を受け付ける", () => {
    expect(isCrossMapSearchShortcut(createKeyEvent({ ctrlKey: true, metaKey: false }))).toBe(true);
    expect(isCrossMapSearchShortcut(createKeyEvent({ ctrlKey: false, metaKey: true, key: "F" }))).toBe(true);
  });

  it("Ctrl と Cmd の同時押し・Alt 併用・Shift なしを拒否する", () => {
    expect(isCrossMapSearchShortcut(createKeyEvent({ ctrlKey: true, metaKey: true }))).toBe(false);
    expect(isCrossMapSearchShortcut(createKeyEvent({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(isCrossMapSearchShortcut(createKeyEvent({ ctrlKey: true, shiftKey: false }))).toBe(false);
  });

  it("repeat・IME 変換中・編集可能要素内を拒否する", () => {
    expect(isCrossMapSearchShortcut(createKeyEvent({ repeat: true }))).toBe(false);
    expect(isCrossMapSearchShortcut(createKeyEvent({ isComposing: true }))).toBe(false);
    const input = document.createElement("input");
    expect(isCrossMapSearchShortcut(createKeyEvent({ target: input }))).toBe(false);
  });
});

describe("useCrossMapSearchShortcut", () => {
  it("enabled=true のとき Cmd/Ctrl+Shift+F で onOpen を呼び preventDefault する", () => {
    const onOpen = jest.fn();
    renderHook(() => useCrossMapSearchShortcut({ enabled: true, onOpen }));

    const event = createKeyEvent({ ctrlKey: true, shiftKey: true, key: "f" });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("enabled=false のときは何もしない", () => {
    const onOpen = jest.fn();
    renderHook(() => useCrossMapSearchShortcut({ enabled: false, onOpen }));

    const event = createKeyEvent({ ctrlKey: true, shiftKey: true, key: "f" });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
