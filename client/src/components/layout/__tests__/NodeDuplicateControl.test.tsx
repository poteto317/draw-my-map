import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeDuplicateControl } from "@/components/layout/NodeDuplicateControl";

describe("NodeDuplicateControl", () => {
  it("「枝を複製」ボタンから複製commandを実行する", async () => {
    const user = userEvent.setup();
    const onDuplicate = jest.fn();
    render(<NodeDuplicateControl disabled={false} onDuplicate={onDuplicate} />);

    const button = screen.getByRole("button", { name: "枝を複製" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toMatch(/focus-visible:/);
    await user.click(button);

    expect(onDuplicate).toHaveBeenCalledTimes(1);
  });

  it("disabledのときはHTMLのdisabledで無効化し、commandを実行しない", async () => {
    const user = userEvent.setup();
    const onDuplicate = jest.fn();
    render(<NodeDuplicateControl disabled onDuplicate={onDuplicate} />);

    const button = screen.getByRole("button", { name: "枝を複製" });
    expect(button).toBeDisabled();
    await user.click(button);
    fireEvent.click(button);

    expect(onDuplicate).not.toHaveBeenCalled();
  });

  it("ダブルクリックの2回目のclick（detail 2）でも複製する", () => {
    const onDuplicate = jest.fn();
    render(<NodeDuplicateControl disabled={false} onDuplicate={onDuplicate} />);
    const button = screen.getByRole("button", { name: "枝を複製" });

    fireEvent.click(button, { detail: 1 });
    fireEvent.click(button, { detail: 2 });

    expect(onDuplicate).toHaveBeenCalledTimes(2);
  });

  it("Enterのリピートを既定動作ごと止める", () => {
    render(<NodeDuplicateControl disabled={false} onDuplicate={jest.fn()} />);
    const button = screen.getByRole("button", { name: "枝を複製" });

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
  });

  it("単発のEnterとSpaceのリピートは止めない", () => {
    render(<NodeDuplicateControl disabled={false} onDuplicate={jest.fn()} />);
    const button = screen.getByRole("button", { name: "枝を複製" });

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
    expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(true);
  });

  it("pointerdownの既定動作を妨げず、編集中の入力のblurを残す", () => {
    render(<NodeDuplicateControl disabled={false} onDuplicate={jest.fn()} />);
    const button = screen.getByRole("button", { name: "枝を複製" });

    const pointerDown = new Event("pointerdown", { bubbles: true, cancelable: true });
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    button.dispatchEvent(pointerDown);
    button.dispatchEvent(mouseDown);

    expect(pointerDown.defaultPrevented).toBe(false);
    expect(mouseDown.defaultPrevented).toBe(false);
  });
});
