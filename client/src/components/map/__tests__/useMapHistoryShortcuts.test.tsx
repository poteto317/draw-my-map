import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMapHistoryShortcuts } from "@/components/map/useMapHistoryShortcuts";

function press(init: KeyboardEventInit, target: EventTarget = window) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("useMapHistoryShortcuts", () => {
  it("Undo・Redoの各キーで対応する関数を呼び、既定動作を止める", () => {
    const undo = jest.fn(() => true);
    const redo = jest.fn(() => true);
    renderHook(() => useMapHistoryShortcuts({ undo, redo }));

    const undoEvent = press({ key: "z", ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(undoEvent.defaultPrevented).toBe(true);

    const redoEvent = press({ key: "Z", metaKey: true, shiftKey: true });
    const ctrlYEvent = press({ key: "y", ctrlKey: true });
    expect(redo).toHaveBeenCalledTimes(2);
    expect(redoEvent.defaultPrevented).toBe(true);
    expect(ctrlYEvent.defaultPrevented).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("履歴が空で関数がfalseを返しても、対象キーの既定動作は止める", () => {
    const undo = jest.fn(() => false);
    const redo = jest.fn(() => false);
    renderHook(() => useMapHistoryShortcuts({ undo, redo }));

    expect(press({ key: "z", ctrlKey: true }).defaultPrevented).toBe(true);
    expect(press({ key: "y", ctrlKey: true }).defaultPrevented).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it("対象外のキーと入力欄内のキーでは関数を呼ばず、既定動作も止めない", () => {
    const undo = jest.fn(() => true);
    const redo = jest.fn(() => true);
    renderHook(() => useMapHistoryShortcuts({ undo, redo }));
    const input = document.createElement("input");
    document.body.appendChild(input);

    const plainZ = press({ key: "z" });
    const altZ = press({ key: "z", ctrlKey: true, altKey: true });
    const inInput = press({ key: "z", ctrlKey: true }, input);
    const repeated = press({ key: "z", ctrlKey: true, repeat: true });

    for (const event of [plainZ, altZ, inInput, repeated]) {
      expect(event.defaultPrevented).toBe(false);
    }
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
    input.remove();
  });

  it("ヘッダーのボタンにフォーカスがあってもショートカットを使える", async () => {
    const user = userEvent.setup();
    const undo = jest.fn(() => true);
    const redo = jest.fn(() => true);
    function Harness() {
      useMapHistoryShortcuts({ undo, redo });
      return <button type="button">JSON書き出し</button>;
    }
    render(<Harness />);
    await user.tab();
    expect(screen.getByRole("button", { name: "JSON書き出し" })).toHaveFocus();

    await user.keyboard("{Control>}z{/Control}");
    await user.keyboard("{Control>}y{/Control}");

    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it("関数を差し替えると、再登録なしで最新の関数を呼ぶ", () => {
    const addListener = jest.spyOn(window, "addEventListener");
    const firstUndo = jest.fn(() => true);
    const latestUndo = jest.fn(() => true);
    const firstRedo = jest.fn(() => true);
    const latestRedo = jest.fn(() => true);
    const { rerender } = renderHook(
      ({ undo, redo }) => useMapHistoryShortcuts({ undo, redo }),
      { initialProps: { undo: firstUndo, redo: firstRedo } },
    );

    rerender({ undo: latestUndo, redo: latestRedo });
    press({ key: "z", ctrlKey: true });
    press({ key: "y", ctrlKey: true });

    expect(firstUndo).not.toHaveBeenCalled();
    expect(firstRedo).not.toHaveBeenCalled();
    expect(latestUndo).toHaveBeenCalledTimes(1);
    expect(latestRedo).toHaveBeenCalledTimes(1);
    const keydownRegistrations = addListener.mock.calls.filter(([type]) => type === "keydown");
    expect(keydownRegistrations).toHaveLength(1);
    addListener.mockRestore();
  });

  it("アンマウント後はキーに反応しない", () => {
    const undo = jest.fn(() => true);
    const redo = jest.fn(() => true);
    const { unmount } = renderHook(() => useMapHistoryShortcuts({ undo, redo }));

    unmount();
    const event = press({ key: "z", ctrlKey: true });

    expect(undo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
