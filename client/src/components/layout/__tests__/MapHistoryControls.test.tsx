import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapHistoryControls } from "@/components/layout/MapHistoryControls";

describe("MapHistoryControls", () => {
  it("元に戻す・やり直すのcommandを対応するボタンから実行する", async () => {
    const user = userEvent.setup();
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    render(<MapHistoryControls canUndo canRedo onUndo={onUndo} onRedo={onRedo} />);

    const undoButton = screen.getByRole("button", { name: "元に戻す" });
    const redoButton = screen.getByRole("button", { name: "やり直す" });
    expect(undoButton).toHaveAttribute("type", "button");
    expect(redoButton).toHaveAttribute("type", "button");

    await user.click(undoButton);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();

    await user.click(redoButton);
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it.each([
    { canUndo: false, canRedo: false },
    { canUndo: true, canRedo: false },
    { canUndo: false, canRedo: true },
  ])("実行できない側をHTMLのdisabledで無効化する（$canUndo / $canRedo）", async ({ canUndo, canRedo }) => {
    const user = userEvent.setup();
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    render(<MapHistoryControls canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} />);
    const undoButton = screen.getByRole("button", { name: "元に戻す" });
    const redoButton = screen.getByRole("button", { name: "やり直す" });

    expect(undoButton.hasAttribute("disabled")).toBe(!canUndo);
    expect(redoButton.hasAttribute("disabled")).toBe(!canRedo);
    await user.click(undoButton);
    await user.click(redoButton);

    expect(onUndo).toHaveBeenCalledTimes(canUndo ? 1 : 0);
    expect(onRedo).toHaveBeenCalledTimes(canRedo ? 1 : 0);
  });

  it("キーボードでフォーカスでき、focus-visibleの表示を持つ", async () => {
    const user = userEvent.setup();
    render(<MapHistoryControls canUndo canRedo onUndo={jest.fn()} onRedo={jest.fn()} />);

    await user.tab();
    const undoButton = screen.getByRole("button", { name: "元に戻す" });
    expect(undoButton).toHaveFocus();
    expect(undoButton.className).toMatch(/focus-visible:/);
    expect(screen.getByRole("button", { name: "やり直す" }).className).toMatch(/focus-visible:/);
  });

  it("pointerdownの既定動作を妨げず、編集中の入力のblurを残す", () => {
    render(<MapHistoryControls canUndo canRedo onUndo={jest.fn()} onRedo={jest.fn()} />);
    const undoButton = screen.getByRole("button", { name: "元に戻す" });

    const pointerDown = new Event("pointerdown", { bubbles: true, cancelable: true });
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    undoButton.dispatchEvent(pointerDown);
    undoButton.dispatchEvent(mouseDown);

    expect(pointerDown.defaultPrevented).toBe(false);
    expect(mouseDown.defaultPrevented).toBe(false);
  });
});
