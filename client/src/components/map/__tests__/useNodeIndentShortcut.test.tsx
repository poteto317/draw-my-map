import { fireEvent, renderHook } from "@testing-library/react";
import {
  useNodeIndentShortcut,
  type UseNodeIndentShortcutOptions,
} from "@/components/map/useNodeIndentShortcut";

function createOptions(
  overrides: Partial<UseNodeIndentShortcutOptions> = {},
): UseNodeIndentShortcutOptions {
  return {
    selectedNodeId: 5,
    isEditing: false,
    hasActiveGesture: () => false,
    enabled: true,
    onChangeNodeIndent: jest.fn(),
    ...overrides,
  };
}

const right = { key: "ArrowRight", keyCode: 39, altKey: true };
const left = { key: "ArrowLeft", keyCode: 37, altKey: true };

describe("useNodeIndentShortcut", () => {
  afterEach(() => jest.restoreAllMocks());

  it("Alt+ArrowRight で indent を要求し preventDefault する", () => {
    const options = createOptions();
    renderHook(() => useNodeIndentShortcut(options));

    const notPrevented = fireEvent.keyDown(document.body, right);

    expect(notPrevented).toBe(false);
    expect(options.onChangeNodeIndent).toHaveBeenCalledTimes(1);
    expect(options.onChangeNodeIndent).toHaveBeenCalledWith(5, "indent");
  });

  it("Alt+ArrowLeft で outdent を要求する", () => {
    const options = createOptions();
    renderHook(() => useNodeIndentShortcut(options));

    const notPrevented = fireEvent.keyDown(document.body, left);

    expect(notPrevented).toBe(false);
    expect(options.onChangeNodeIndent).toHaveBeenCalledWith(5, "outdent");
  });

  it("repeat でも呼ぶ", () => {
    const options = createOptions();
    renderHook(() => useNodeIndentShortcut(options));

    const notPrevented = fireEvent.keyDown(document.body, { ...right, repeat: true });

    expect(notPrevented).toBe(false);
    expect(options.onChangeNodeIndent).toHaveBeenCalledTimes(1);
  });

  it("enabled が偽なら呼ばず抑止もせず、真に戻すと呼ぶ", () => {
    const onChangeNodeIndent = jest.fn();
    const { rerender } = renderHook(
      (props: UseNodeIndentShortcutOptions) => useNodeIndentShortcut(props),
      { initialProps: createOptions({ enabled: false, onChangeNodeIndent }) },
    );

    expect(fireEvent.keyDown(document.body, right)).toBe(true);
    expect(onChangeNodeIndent).not.toHaveBeenCalled();

    rerender(createOptions({ enabled: true, onChangeNodeIndent }));
    fireEvent.keyDown(document.body, right);

    expect(onChangeNodeIndent).toHaveBeenCalledTimes(1);
  });

  it("options が変わっても keydown の登録をやり直さない", () => {
    const addSpy = jest.spyOn(window, "addEventListener");
    const { rerender } = renderHook(
      (props: UseNodeIndentShortcutOptions) => useNodeIndentShortcut(props),
      { initialProps: createOptions() },
    );

    rerender(createOptions({
      enabled: false,
      selectedNodeId: 9,
      onChangeNodeIndent: jest.fn(),
      hasActiveGesture: () => true,
    }));

    expect(addSpy.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
  });

  it("最新の options で動く", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(
      (props: UseNodeIndentShortcutOptions) => useNodeIndentShortcut(props),
      { initialProps: createOptions({ onChangeNodeIndent: first }) },
    );

    rerender(createOptions({ selectedNodeId: 8, onChangeNodeIndent: second }));
    fireEvent.keyDown(document.body, left);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(8, "outdent");
  });

  it("hasActiveGesture は keydown の時点で呼び、ジェスチャー中は呼ばず抑止する", () => {
    let active = false;
    const options = createOptions({ hasActiveGesture: () => active });
    renderHook(() => useNodeIndentShortcut(options));

    active = true;
    const notPrevented = fireEvent.keyDown(document.body, right);

    expect(notPrevented).toBe(false);
    expect(options.onChangeNodeIndent).not.toHaveBeenCalled();
  });

  it("選択なしの body への Alt+ArrowLeft は呼ばず、既定動作を止める", () => {
    const options = createOptions({ selectedNodeId: null });
    renderHook(() => useNodeIndentShortcut(options));

    const notPrevented = fireEvent.keyDown(document.body, left);

    expect(notPrevented).toBe(false);
    expect(options.onChangeNodeIndent).not.toHaveBeenCalled();
  });

  it("目印の無い button への Alt+ArrowLeft は呼ばず、既定動作を止める", () => {
    const options = createOptions();
    renderHook(() => useNodeIndentShortcut(options));
    const button = document.createElement("button");
    document.body.appendChild(button);

    const notPrevented = fireEvent.keyDown(button, left);
    button.remove();

    expect(notPrevented).toBe(false);
    expect(options.onChangeNodeIndent).not.toHaveBeenCalled();
  });

  it("input に送った Alt+ArrowLeft は呼ばず preventDefault しない", () => {
    const options = createOptions();
    renderHook(() => useNodeIndentShortcut(options));
    const input = document.createElement("input");
    document.body.appendChild(input);

    const notPrevented = fireEvent.keyDown(input, left);
    input.remove();

    expect(notPrevented).toBe(true);
    expect(options.onChangeNodeIndent).not.toHaveBeenCalled();
  });

  it.each([
    ["編集中", { options: { isEditing: true }, init: right }],
    ["Alt+Shift+ArrowRight", { options: {}, init: { ...right, shiftKey: true } }],
    ["IME 変換中", { options: {}, init: { ...right, isComposing: true } }],
    ["Alt+ArrowUp", { options: {}, init: { key: "ArrowUp", keyCode: 38, altKey: true } }],
  ])("%s は呼ばず preventDefault しない", (_name, { options: overrides, init }) => {
    const options = createOptions(overrides);
    renderHook(() => useNodeIndentShortcut(options));

    const notPrevented = fireEvent.keyDown(document.body, init);

    expect(notPrevented).toBe(true);
    expect(options.onChangeNodeIndent).not.toHaveBeenCalled();
  });
});
