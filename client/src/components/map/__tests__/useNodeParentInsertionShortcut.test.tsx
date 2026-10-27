import { fireEvent, renderHook } from "@testing-library/react";
import {
  useNodeParentInsertionShortcut,
  type UseNodeParentInsertionShortcutOptions,
} from "@/components/map/useNodeParentInsertionShortcut";
import { TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE } from "@/components/map/treeEditShortcutGuard";

function createOptions(
  overrides: Partial<UseNodeParentInsertionShortcutOptions> = {},
): UseNodeParentInsertionShortcutOptions {
  return {
    selectedNodeId: 5,
    isEditing: false,
    hasActiveGesture: () => false,
    enabled: true,
    onInsertParentNode: jest.fn(),
    ...overrides,
  };
}

const altEnter = { key: "Enter", keyCode: 13, altKey: true };

describe("useNodeParentInsertionShortcut", () => {
  afterEach(() => jest.restoreAllMocks());

  it("Alt+Enter で選択中のノードの親の挿入を要求し preventDefault する", () => {
    const options = createOptions();
    renderHook(() => useNodeParentInsertionShortcut(options));

    const notPrevented = fireEvent.keyDown(document.body, altEnter);

    expect(notPrevented).toBe(false);
    expect(options.onInsertParentNode).toHaveBeenCalledTimes(1);
    expect(options.onInsertParentNode).toHaveBeenCalledWith(5);
  });

  it("押し続け（repeat）では呼ばず、既定動作は止める", () => {
    const options = createOptions();
    renderHook(() => useNodeParentInsertionShortcut(options));

    const notPrevented = fireEvent.keyDown(document.body, { ...altEnter, repeat: true });

    expect(notPrevented).toBe(false);
    expect(options.onInsertParentNode).not.toHaveBeenCalled();
  });

  it("enabled が偽なら選択中でも呼ばず抑止もせず、真に戻すと呼ぶ", () => {
    const onInsertParentNode = jest.fn();
    const { rerender } = renderHook(
      (props: UseNodeParentInsertionShortcutOptions) => useNodeParentInsertionShortcut(props),
      { initialProps: createOptions({ enabled: false, onInsertParentNode }) },
    );

    expect(fireEvent.keyDown(document.body, altEnter)).toBe(true);
    expect(onInsertParentNode).not.toHaveBeenCalled();

    rerender(createOptions({ enabled: true, onInsertParentNode }));
    fireEvent.keyDown(document.body, altEnter);

    expect(onInsertParentNode).toHaveBeenCalledTimes(1);
  });

  it("options が変わっても keydown の登録をやり直さない", () => {
    const addSpy = jest.spyOn(window, "addEventListener");
    const { rerender } = renderHook(
      (props: UseNodeParentInsertionShortcutOptions) => useNodeParentInsertionShortcut(props),
      { initialProps: createOptions() },
    );

    rerender(createOptions({
      enabled: false,
      selectedNodeId: 9,
      onInsertParentNode: jest.fn(),
      hasActiveGesture: () => true,
    }));

    expect(addSpy.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
  });

  it("hasActiveGesture は keydown の時点で呼び、ジェスチャー中は呼ばず抑止もしない", () => {
    let active = false;
    const options = createOptions({ hasActiveGesture: () => active });
    renderHook(() => useNodeParentInsertionShortcut(options));

    active = true;
    const notPrevented = fireEvent.keyDown(document.body, altEnter);

    expect(notPrevented).toBe(true);
    expect(options.onInsertParentNode).not.toHaveBeenCalled();
  });

  it("未選択の body への Alt+Enter は呼ばず、抑止もしない", () => {
    const options = createOptions({ selectedNodeId: null });
    renderHook(() => useNodeParentInsertionShortcut(options));

    expect(fireEvent.keyDown(document.body, altEnter)).toBe(true);
    expect(options.onInsertParentNode).not.toHaveBeenCalled();
  });

  it("input に送った Alt+Enter は呼ばず、抑止もしない", () => {
    const options = createOptions();
    renderHook(() => useNodeParentInsertionShortcut(options));
    const input = document.createElement("input");
    document.body.appendChild(input);

    const notPrevented = fireEvent.keyDown(input, altEnter);
    input.remove();

    expect(notPrevented).toBe(true);
    expect(options.onInsertParentNode).not.toHaveBeenCalled();
  });

  it("Alt なしの Enter は呼ばず、抑止もしない", () => {
    const options = createOptions();
    renderHook(() => useNodeParentInsertionShortcut(options));

    expect(fireEvent.keyDown(document.body, { key: "Enter", keyCode: 13 })).toBe(true);
    expect(options.onInsertParentNode).not.toHaveBeenCalled();
  });

  it("目印付きの button に送った Alt+Enter は呼ぶ", () => {
    const options = createOptions();
    renderHook(() => useNodeParentInsertionShortcut(options));
    const button = document.createElement("button");
    button.setAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE, "");
    document.body.appendChild(button);

    const notPrevented = fireEvent.keyDown(button, altEnter);
    button.remove();

    expect(notPrevented).toBe(false);
    expect(options.onInsertParentNode).toHaveBeenCalledTimes(1);
    expect(options.onInsertParentNode).toHaveBeenCalledWith(5);
  });
});
