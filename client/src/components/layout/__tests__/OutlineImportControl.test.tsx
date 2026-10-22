import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutlineImportControl } from "@/components/layout/OutlineImportControl";

function renderControl(expanded = false, onOpen = jest.fn()) {
  const buttonRef = createRef<HTMLButtonElement>();
  render(<OutlineImportControl expanded={expanded} onOpen={onOpen} buttonRef={buttonRef} />);
  return { button: screen.getByRole("button", { name: "箇条書きから追加" }), onOpen, buttonRef };
}

describe("OutlineImportControl", () => {
  it("ダイアログを開くボタンとして名前・type・aria-haspopupを持つ", () => {
    const { button } = renderControl();

    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toBeEnabled();
  });

  it("expandedがfalseならaria-expandedがfalseになる", () => {
    const { button } = renderControl(false);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("expandedがtrueならaria-expandedがtrueになる", () => {
    const { button } = renderControl(true);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("クリックでonOpenを1回呼ぶ", async () => {
    const user = userEvent.setup();
    const { button, onOpen } = renderControl();

    await user.click(button);

    expect(onOpen).toHaveBeenCalledTimes(1);
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

  it("フォーカスリングのクラスを持つ", () => {
    const { button } = renderControl();

    expect(button.className).toMatch(/focus-visible:/);
  });
});
