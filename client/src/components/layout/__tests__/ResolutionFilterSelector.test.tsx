import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResolutionFilterSelector } from "@/components/layout/ResolutionFilterSelector";

describe("ResolutionFilterSelector", () => {
  it("表示モードを名前付きグループとして提供する", () => {
    render(
      <ResolutionFilterSelector mode="auto" level="all" onChange={jest.fn()} />,
    );

    expect(screen.getByRole("group", { name: "表示" })).toBeInTheDocument();
    expect(screen.getByText("表示")).toBeVisible();
  });

  it.each([
    ["auto", "表示 自動", "表示 高のみ"],
    ["high", "表示 高のみ", "表示 中以上"],
    ["medium", "表示 中以上", "表示 すべて"],
    ["all", "表示 すべて", "表示 自動"],
  ] as const)("%sをaria-pressedで選択状態として示す", (mode, selectedName, idleName) => {
    render(<ResolutionFilterSelector mode={mode} level="medium" onChange={jest.fn()} />);

    expect(screen.getByRole("button", { name: selectedName }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: idleName }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("auto時は現在の表示段階を日本語で示す", () => {
    render(<ResolutionFilterSelector mode="auto" level="all" onChange={jest.fn()} />);

    expect(screen.getByText("現在: すべて")).toBeInTheDocument();
  });

  it.each([
    ["表示 自動", "auto"],
    ["表示 高のみ", "high"],
    ["表示 中以上", "medium"],
    ["表示 すべて", "all"],
  ] as const)("%sをクリックすると%sを通知する", async (name, expectedMode) => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<ResolutionFilterSelector mode="auto" level="all" onChange={onChange} />);

    const button = screen.getByRole("button", { name });
    expect(button).toHaveAttribute("type", "button");
    await user.click(button);

    expect(onChange).toHaveBeenCalledWith(expectedMode);
  });
});
