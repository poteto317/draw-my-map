import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelReplaceControl } from "@/components/layout/LabelReplaceControl";

describe("LabelReplaceControl", () => {
  it("ダイアログを開くボタンとして名前・aria 属性を持つ", () => {
    render(<LabelReplaceControl expanded={false} disabled={false} onOpen={jest.fn()} buttonRef={createRef()} />);

    const button = screen.getByRole("button", { name: "一括置換" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("expanded のとき aria-expanded が true になる", () => {
    render(<LabelReplaceControl expanded disabled={false} onOpen={jest.fn()} buttonRef={createRef()} />);

    expect(screen.getByRole("button", { name: "一括置換" })).toHaveAttribute("aria-expanded", "true");
  });

  it("クリックで onOpen を呼び、disabled のときは押せない", async () => {
    const onOpen = jest.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <LabelReplaceControl expanded={false} disabled={false} onOpen={onOpen} buttonRef={createRef()} />,
    );

    await user.click(screen.getByRole("button", { name: "一括置換" }));
    expect(onOpen).toHaveBeenCalledTimes(1);

    rerender(<LabelReplaceControl expanded={false} disabled onOpen={onOpen} buttonRef={createRef()} />);
    expect(screen.getByRole("button", { name: "一括置換" })).toBeDisabled();
  });

  it("押し続けたリピートの Enter・Space では既定動作を止める（開いた直後のダイアログへ click が届かない）", () => {
    render(<LabelReplaceControl expanded={false} disabled={false} onOpen={jest.fn()} buttonRef={createRef()} />);
    const button = screen.getByRole("button", { name: "一括置換" });

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
  });
});
