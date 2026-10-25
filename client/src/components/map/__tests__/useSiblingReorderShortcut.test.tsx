import { fireEvent, renderHook } from "@testing-library/react";
import {
  useSiblingReorderShortcut,
  type UseSiblingReorderShortcutOptions,
} from "@/components/map/useSiblingReorderShortcut";

function createOptions(
  overrides: Partial<UseSiblingReorderShortcutOptions> = {},
): UseSiblingReorderShortcutOptions {
  return {
    selectedNodeId: 5,
    isEditing: false,
    hasActiveGesture: () => false,
    enabled: true,
    onReorderSibling: jest.fn(),
    ...overrides,
  };
}

describe("useSiblingReorderShortcut", () => {
  afterEach(() => jest.restoreAllMocks());

  it("Alt+ArrowUp で step up を要求し preventDefault する", () => {
    const options = createOptions();
    renderHook(() => useSiblingReorderShortcut(options));

    const notPrevented = fireEvent.keyDown(document.body, { key: "ArrowUp", keyCode: 38, altKey: true });

    expect(notPrevented).toBe(false);
    expect(options.onReorderSibling).toHaveBeenCalledTimes(1);
    expect(options.onReorderSibling).toHaveBeenCalledWith(5, { kind: "step", direction: "up" });
  });

  it("Alt+ArrowDown で step down を要求する", () => {
    const options = createOptions();
    renderHook(() => useSiblingReorderShortcut(options));

    const notPrevented = fireEvent.keyDown(document.body, { key: "ArrowDown", keyCode: 40, altKey: true });

    expect(notPrevented).toBe(false);
    expect(options.onReorderSibling).toHaveBeenCalledWith(5, { kind: "step", direction: "down" });
  });

  it("repeat でも呼ぶ", () => {
    const options = createOptions();
    renderHook(() => useSiblingReorderShortcut(options));

    const notPrevented = fireEvent.keyDown(document.body, {
      key: "ArrowUp", keyCode: 38, altKey: true, repeat: true,
    });

    expect(notPrevented).toBe(false);
    expect(options.onReorderSibling).toHaveBeenCalledTimes(1);
  });

  it("enabled が偽なら呼ばず、真に戻すと呼ぶ", () => {
    const onReorderSibling = jest.fn();
    const { rerender } = renderHook(
      (props: UseSiblingReorderShortcutOptions) => useSiblingReorderShortcut(props),
      { initialProps: createOptions({ enabled: false, onReorderSibling }) },
    );

    expect(fireEvent.keyDown(document.body, { key: "ArrowUp", keyCode: 38, altKey: true })).toBe(true);
    expect(onReorderSibling).not.toHaveBeenCalled();

    rerender(createOptions({ enabled: true, onReorderSibling }));
    fireEvent.keyDown(document.body, { key: "ArrowUp", keyCode: 38, altKey: true });

    expect(onReorderSibling).toHaveBeenCalledTimes(1);
  });

  it("options が変わっても keydown の登録をやり直さない", () => {
    const addSpy = jest.spyOn(window, "addEventListener");
    const { rerender } = renderHook(
      (props: UseSiblingReorderShortcutOptions) => useSiblingReorderShortcut(props),
      { initialProps: createOptions() },
    );

    rerender(createOptions({
      enabled: false,
      selectedNodeId: 9,
      onReorderSibling: jest.fn(),
      hasActiveGesture: () => true,
    }));

    const keydownCalls = addSpy.mock.calls.filter(([type]) => type === "keydown");
    expect(keydownCalls).toHaveLength(1);
  });

  it("最新の options で動く", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(
      (props: UseSiblingReorderShortcutOptions) => useSiblingReorderShortcut(props),
      { initialProps: createOptions({ onReorderSibling: first }) },
    );

    rerender(createOptions({ selectedNodeId: 8, onReorderSibling: second }));
    fireEvent.keyDown(document.body, { key: "ArrowDown", keyCode: 40, altKey: true });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(8, { kind: "step", direction: "down" });
  });

  it("hasActiveGesture は keydown の時点で呼ぶ", () => {
    let active = false;
    const options = createOptions({ hasActiveGesture: () => active });
    renderHook(() => useSiblingReorderShortcut(options));

    active = true;
    const notPrevented = fireEvent.keyDown(document.body, { key: "ArrowUp", keyCode: 38, altKey: true });

    expect(notPrevented).toBe(true);
    expect(options.onReorderSibling).not.toHaveBeenCalled();
  });

  it.each([
    ["編集中", { options: { isEditing: true }, init: { altKey: true } }],
    ["選択なし", { options: { selectedNodeId: null }, init: { altKey: true } }],
    ["Shift 併用", { options: {}, init: { altKey: true, shiftKey: true } }],
    ["IME 変換中", { options: {}, init: { altKey: true, isComposing: true } }],
  ])("%s は呼ばず preventDefault しない", (_name, { options: overrides, init }) => {
    const options = createOptions(overrides);
    renderHook(() => useSiblingReorderShortcut(options));

    const notPrevented = fireEvent.keyDown(document.body, { key: "ArrowUp", keyCode: 38, ...init });

    expect(notPrevented).toBe(true);
    expect(options.onReorderSibling).not.toHaveBeenCalled();
  });

  it("input に送ったキーは呼ばず preventDefault しない", () => {
    const options = createOptions();
    renderHook(() => useSiblingReorderShortcut(options));
    const input = document.createElement("input");
    document.body.appendChild(input);

    const notPrevented = fireEvent.keyDown(input, { key: "ArrowUp", keyCode: 38, altKey: true });
    input.remove();

    expect(notPrevented).toBe(true);
    expect(options.onReorderSibling).not.toHaveBeenCalled();
  });
});
