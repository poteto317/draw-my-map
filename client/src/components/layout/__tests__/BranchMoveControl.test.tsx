import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BranchMoveControl } from "@/components/layout/BranchMoveControl";

function renderControl({ expanded = false, disabled = false, onOpen = jest.fn() } = {}) {
  const buttonRef = createRef<HTMLButtonElement>();
  render(
    <BranchMoveControl expanded={expanded} disabled={disabled} onOpen={onOpen} buttonRef={buttonRef} />,
  );
  return { button: screen.getByRole("button", { name: "枝を移動" }), onOpen, buttonRef };
}

describe("BranchMoveControl", () => {
  it("ダイアログを開くボタンとして名前・type・aria-haspopupを持つ", () => {
    const { button } = renderControl();

    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toBeEnabled();
  });

  it.each([false, true])("expandedが%sならaria-expandedに反映する", (expanded) => {
    const { button } = renderControl({ expanded });

    expect(button).toHaveAttribute("aria-expanded", String(expanded));
  });

  it("クリックでonOpenを1回呼ぶ", async () => {
    const user = userEvent.setup();
    const { button, onOpen } = renderControl();

    await user.click(button);

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("disabledなら押せない", async () => {
    const user = userEvent.setup();
    const { button, onOpen } = renderControl({ disabled: true });

    await user.click(button);

    expect(button).toBeDisabled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("押し続けたEnterとSpaceのkeydownはpreventDefaultする", () => {
    const { button } = renderControl();

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
  });

  it("repeatでないEnterとSpace、repeatの他のキーはpreventDefaultしない", () => {
    const { button } = renderControl();

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
    expect(fireEvent.keyDown(button, { key: " ", repeat: false })).toBe(true);
    expect(fireEvent.keyDown(button, { key: "a", repeat: true })).toBe(true);
  });

  it("buttonRefがボタンの要素を指す", () => {
    const { button, buttonRef } = renderControl();

    expect(buttonRef.current).toBe(button);
  });

  it("フォーカスリングと無効のクラスを持つ", () => {
    const { button } = renderControl();

    expect(button.className).toMatch(/focus-visible:/);
    expect(button.className).toMatch(/disabled:/);
  });
});
