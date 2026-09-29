import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeImportanceSelector } from "@/components/layout/NodeImportanceSelector";

describe("NodeImportanceSelector", () => {
  it("重要度の選択肢を名前付きグループとして提供する", () => {
    render(
      <NodeImportanceSelector
        importance="medium"
        disabled={false}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByRole("group", { name: "重要度" })).toBeInTheDocument();
    expect(screen.getByText("重要度")).toBeVisible();
  });

  it.each([
    ["high", "重要度 高", "重要度 中"],
    ["medium", "重要度 中", "重要度 低"],
    ["low", "重要度 低", "重要度 高"],
  ] as const)("%sをaria-pressedで選択状態として示す", (importance, selectedName, idleName) => {
    render(
      <NodeImportanceSelector
        importance={importance}
        disabled={false}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: selectedName }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: idleName }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("未選択時は全ボタンを無効化する", () => {
    render(
      <NodeImportanceSelector
        importance={null}
        disabled
        onChange={jest.fn()}
      />,
    );

    ["重要度 高", "重要度 中", "重要度 低"].forEach((name) => {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    });
  });

  it.each([
    ["重要度 高", "high"],
    ["重要度 中", "medium"],
    ["重要度 低", "low"],
  ] as const)("%sをクリックすると%sを通知する", async (name, expectedImportance) => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <NodeImportanceSelector
        importance="medium"
        disabled={false}
        onChange={onChange}
      />,
    );

    const button = screen.getByRole("button", { name });
    expect(button).toHaveAttribute("type", "button");
    await user.click(button);

    expect(onChange).toHaveBeenCalledWith(expectedImportance);
  });
});
