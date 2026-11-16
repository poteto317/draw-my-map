import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeSplitControl } from "@/components/layout/NodeSplitControl";

const REASON = "分割できるノードが選択されていません。";

type Props = Parameters<typeof NodeSplitControl>[0];

function renderControl(overrides: Partial<Props> = {}) {
  const props: Props = {
    expanded: false,
    disabled: false,
    disabledReason: REASON,
    onOpen: jest.fn(),
    buttonRef: createRef(),
    ...overrides,
  };
  return { props, ...render(<NodeSplitControl {...props} />) };
}

describe("NodeSplitControl", () => {
  it("ダイアログを開くボタンとして名前・aria 属性を持つ", () => {
    renderControl();

    const button = screen.getByRole("button", { name: "ノードを分割" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("expanded のとき aria-expanded が true になる", () => {
    renderControl({ expanded: true });

    expect(screen.getByRole("button", { name: "ノードを分割" })).toHaveAttribute("aria-expanded", "true");
  });

  it("クリックで onOpen を呼ぶ", async () => {
    const user = userEvent.setup();
    const { props } = renderControl();

    await user.click(screen.getByRole("button", { name: "ノードを分割" }));

    expect(props.onOpen).toHaveBeenCalledTimes(1);
  });

  it("有効のときは、理由の説明も title も付けない", () => {
    renderControl();

    const button = screen.getByRole("button", { name: "ノードを分割" });
    expect(button).not.toHaveAttribute("title");
    expect(button).not.toHaveAccessibleDescription();
  });

  it("無効のときは押せず、理由を title と説明（aria-describedby）で示す", async () => {
    const user = userEvent.setup();
    const { props } = renderControl({ disabled: true });

    const button = screen.getByRole("button", { name: "ノードを分割" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", REASON);
    expect(button).toHaveAccessibleDescription(REASON);

    await user.click(button);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("押し続けたリピートの Enter・Space では既定動作を止める（開いた直後のダイアログへ click が届かない）", () => {
    renderControl();
    const button = screen.getByRole("button", { name: "ノードを分割" });

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
  });

  it("buttonRef をボタンへ渡す", () => {
    const buttonRef = createRef<HTMLButtonElement>();

    renderControl({ buttonRef });

    expect(buttonRef.current).toBe(screen.getByRole("button", { name: "ノードを分割" }));
  });
});
