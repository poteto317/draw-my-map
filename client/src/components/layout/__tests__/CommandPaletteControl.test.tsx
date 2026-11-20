import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPaletteControl } from "@/components/layout/CommandPaletteControl";

function renderControl({ expanded = false, onOpen = jest.fn() } = {}) {
  const buttonRef = createRef<HTMLButtonElement>();
  render(
    <CommandPaletteControl expanded={expanded} onOpen={onOpen} buttonRef={buttonRef} />,
  );
  return { button: screen.getByRole("button", { name: "コマンド" }), onOpen, buttonRef };
}

describe("CommandPaletteControl", () => {
  it("ボタン名「コマンド」と aria-haspopup / aria-expanded / aria-keyshortcuts を持つ", () => {
    const { button } = renderControl();

    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-keyshortcuts", "Control+K Meta+K");
  });

  it.each([false, true])("expanded が %s なら aria-expanded に反映する", (expanded) => {
    const { button } = renderControl({ expanded });
    expect(button).toHaveAttribute("aria-expanded", String(expanded));
  });

  it("クリックで onOpen を 1 回呼ぶ（ゲートは親）", async () => {
    const user = userEvent.setup();
    const { button, onOpen } = renderControl();

    await user.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("押し続けた Enter / Space の keydown は preventDefault する", () => {
    const { button } = renderControl();

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
  });

  it("buttonRef がボタン要素を指す", () => {
    const { button, buttonRef } = renderControl();
    expect(buttonRef.current).toBe(button);
  });
});
