import { fireEvent, render, screen } from "@testing-library/react";
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
  describe("Enterの押し続け（キーリピート）", () => {
    it.each(["元に戻す", "やり直す"])("「%s」はEnterのリピートを既定動作ごと止める", (name) => {
      render(<MapHistoryControls canUndo canRedo onUndo={jest.fn()} onRedo={jest.fn()} />);
      const button = screen.getByRole("button", { name });

      expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    });

    it.each(["元に戻す", "やり直す"])("「%s」は単発のEnterとSpaceのリピートは止めない", (name) => {
      render(<MapHistoryControls canUndo canRedo onUndo={jest.fn()} onRedo={jest.fn()} />);
      const button = screen.getByRole("button", { name });

      expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
      expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(true);
    });
  });

  describe("押したボタンが無効になったときのフォーカス", () => {
    function renderControls(canUndo: boolean, canRedo: boolean) {
      return render(<MapHistoryControls canUndo={canUndo} canRedo={canRedo} onUndo={jest.fn()} onRedo={jest.fn()} />);
    }

    it("「元に戻す」が無効になったら、有効な「やり直す」へフォーカスを移す", () => {
      const { rerender } = renderControls(true, false);
      screen.getByRole("button", { name: "元に戻す" }).focus();

      rerender(<MapHistoryControls canUndo={false} canRedo onUndo={jest.fn()} onRedo={jest.fn()} />);

      expect(screen.getByRole("button", { name: "やり直す" })).toHaveFocus();
    });

    it("「やり直す」が無効になったら、有効な「元に戻す」へフォーカスを移す", () => {
      const { rerender } = renderControls(false, true);
      screen.getByRole("button", { name: "やり直す" }).focus();

      rerender(<MapHistoryControls canUndo canRedo={false} onUndo={jest.fn()} onRedo={jest.fn()} />);

      expect(screen.getByRole("button", { name: "元に戻す" })).toHaveFocus();
    });

    it("両方が無効になったときは、フォーカスを移さない", () => {
      const { rerender } = renderControls(true, false);
      const undoButton = screen.getByRole("button", { name: "元に戻す" });
      undoButton.focus();

      rerender(<MapHistoryControls canUndo={false} canRedo={false} onUndo={jest.fn()} onRedo={jest.fn()} />);

      expect(screen.getByRole("button", { name: "やり直す" })).not.toHaveFocus();
    });

    it("もう一方も無効ならフォーカスを移さない", () => {
      const { rerender } = renderControls(true, false);
      screen.getByRole("button", { name: "元に戻す" }).focus();
      // 無効のボタンにはfocus()しても移らないので、移そうとしたこと自体をspyで確かめる
      const focusSpy = jest.spyOn(HTMLElement.prototype, "focus");
      try {
        rerender(<MapHistoryControls canUndo={false} canRedo={false} onUndo={jest.fn()} onRedo={jest.fn()} />);
        expect(focusSpy).not.toHaveBeenCalled();
      } finally {
        focusSpy.mockRestore();
      }
    });

    it("両方が無効になった後は記録を捨て、後で片方が有効になってもフォーカスを移さない", () => {
      const { rerender } = renderControls(true, false);
      screen.getByRole("button", { name: "元に戻す" }).focus();
      rerender(<MapHistoryControls canUndo={false} canRedo={false} onUndo={jest.fn()} onRedo={jest.fn()} />);
      // jsdomは無効化したボタンにフォーカスを残すため、別の要素を経由してbodyへ戻す
      const outside = document.createElement("input");
      document.body.appendChild(outside);
      outside.focus();
      outside.blur();
      outside.remove();
      expect(document.body).toHaveFocus();

      rerender(<MapHistoryControls canUndo={false} canRedo onUndo={jest.fn()} onRedo={jest.fn()} />);

      expect(document.body).toHaveFocus();
      expect(screen.getByRole("button", { name: "やり直す" })).not.toHaveFocus();
    });

    it("フォーカスがボタンの外にあるときは、フォーカスを移さない", () => {
      const { rerender } = render(
        <>
          <input aria-label="ラベル" />
          <MapHistoryControls canUndo canRedo={false} onUndo={jest.fn()} onRedo={jest.fn()} />
        </>,
      );
      screen.getByRole("button", { name: "元に戻す" }).focus();
      const input = screen.getByRole("textbox", { name: "ラベル" });
      input.focus();

      rerender(
        <>
          <input aria-label="ラベル" />
          <MapHistoryControls canUndo={false} canRedo onUndo={jest.fn()} onRedo={jest.fn()} />
        </>,
      );

      expect(input).toHaveFocus();
    });

    it("ブラウザがフォーカスをbodyへ戻した後でも、もう一方のボタンへ移す", () => {
      const { rerender } = renderControls(true, false);
      const undoButton = screen.getByRole("button", { name: "元に戻す" });
      undoButton.focus();
      // 無効化した時点でbodyへフォーカスを戻すブラウザ（focus fixup）を再現する
      const setAttribute = undoButton.setAttribute.bind(undoButton);
      jest.spyOn(undoButton, "setAttribute").mockImplementation((name, value) => {
        if (name === "disabled") undoButton.blur();
        setAttribute(name, value);
      });

      rerender(<MapHistoryControls canUndo={false} canRedo onUndo={jest.fn()} onRedo={jest.fn()} />);

      expect(undoButton.setAttribute).toHaveBeenCalledWith("disabled", "");
      expect(undoButton).toBeDisabled();
      expect(screen.getByRole("button", { name: "やり直す" })).toHaveFocus();
    });
  });
});
