import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelTextStyleControl } from "@/components/layout/LabelTextStyleControl";

const defaultProps = {
  visible: true,
  disabled: false,
  fontSize: 14 as const,
  bold: false,
  underline: false,
  onFontSizeChange: jest.fn(),
  onToggleBold: jest.fn(),
  onToggleUnderline: jest.fn(),
};

describe("LabelTextStyleControl", () => {
  beforeEach(() => {
    defaultProps.onFontSizeChange = jest.fn();
    defaultProps.onToggleBold = jest.fn();
    defaultProps.onToggleUnderline = jest.fn();
  });

  it("visible が false のときは描画しない", () => {
    const { container } = render(
      <LabelTextStyleControl {...defaultProps} visible={false} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: "文字" })).not.toBeInTheDocument();
  });

  it("パネルを開くとサイズ・太字・下線を表示する", async () => {
    const user = userEvent.setup();
    render(<LabelTextStyleControl {...defaultProps} />);

    const trigger = screen.getByRole("button", { name: "文字" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "文字" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "文字サイズ" })).toHaveValue("14");
    expect(screen.getByRole("button", { name: "太字" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "下線" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it.each([
    ["小", 12],
    ["標準", 14],
    ["大", 18],
    ["特大", 24],
  ] as const)("%s を選ぶと onFontSizeChange に %s を通知する", async (label, size) => {
    const user = userEvent.setup();
    render(<LabelTextStyleControl {...defaultProps} fontSize={14} />);

    await user.click(screen.getByRole("button", { name: "文字" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "文字サイズ" }),
      label,
    );

    expect(defaultProps.onFontSizeChange).toHaveBeenCalledWith(size);
  });

  it("太字トグルで onToggleBold を呼ぶ", async () => {
    const user = userEvent.setup();
    render(<LabelTextStyleControl {...defaultProps} bold />);

    await user.click(screen.getByRole("button", { name: "文字" }));
    expect(screen.getByRole("button", { name: "太字" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "太字" }));

    expect(defaultProps.onToggleBold).toHaveBeenCalledTimes(1);
  });

  it("下線トグルで onToggleUnderline を呼ぶ", async () => {
    const user = userEvent.setup();
    render(<LabelTextStyleControl {...defaultProps} underline />);

    await user.click(screen.getByRole("button", { name: "文字" }));
    expect(screen.getByRole("button", { name: "下線" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "下線" }));

    expect(defaultProps.onToggleUnderline).toHaveBeenCalledTimes(1);
  });

  it("disabled のときサイズ・太字・下線を操作できない", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<LabelTextStyleControl {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "文字" }));
    rerender(<LabelTextStyleControl {...defaultProps} disabled />);

    expect(screen.getByRole("combobox", { name: "文字サイズ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "太字" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下線" })).toBeDisabled();
  });

  it("visible が false になると開いていたパネルを閉じる（L-214）", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<LabelTextStyleControl {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "文字" }));
    expect(screen.getByRole("group", { name: "文字" })).toBeInTheDocument();

    rerender(<LabelTextStyleControl {...defaultProps} visible={false} />);

    expect(screen.queryByRole("group", { name: "文字" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "文字" })).not.toBeInTheDocument();
  });
});
