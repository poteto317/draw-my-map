import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeImportanceSelector } from "@/components/layout/NodeImportanceSelector";

describe("NodeImportanceSelector", () => {
  it("重要度の選択肢を名前付きグループとして提供する", () => {
    render(
      <NodeImportanceSelector
        importance="medium"
        disabled={false}
        selectionCount={1}
        mixed={false}
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
        selectionCount={1}
        mixed={false}
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
        selectionCount={0}
        mixed={false}
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
        selectionCount={1}
        mixed={false}
        onChange={onChange}
      />,
    );

    const button = screen.getByRole("button", { name });
    expect(button).toHaveAttribute("type", "button");
    await user.click(button);

    expect(onChange).toHaveBeenCalledWith(expectedImportance);
  });

  it("2件以上選択中は件数をライブリージョンに表示し、グループ名に件数を含める", () => {
    render(
      <NodeImportanceSelector
        importance="high"
        disabled={false}
        selectionCount={3}
        mixed={false}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByRole("group", { name: "重要度（3件選択中）" })).toBeInTheDocument();
    expect(screen.getByText("3件選択中")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "重要度 高" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("混在時はどのボタンも押下表示にせず、混在を併記する", () => {
    render(
      <NodeImportanceSelector
        importance={null}
        disabled={false}
        selectionCount={2}
        mixed
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByText("2件選択中・混在")).toBeVisible();
    ["重要度 高", "重要度 中", "重要度 低"].forEach((name) => {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("aria-pressed", "false");
      expect(button).toBeEnabled();
    });
  });

  it.each([0, 1])("選択%i件ではライブリージョンを空のまま描画し、グループ名は重要度のまま", (count) => {
    const { container } = render(
      <NodeImportanceSelector
        importance={count === 1 ? "medium" : null}
        disabled={count === 0}
        selectionCount={count}
        mixed={false}
        onChange={jest.fn()}
      />,
    );

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toBeEmptyDOMElement();
    expect(screen.getByRole("group", { name: "重要度" })).toBeInTheDocument();
  });

  it("件数が変わってもライブリージョンの要素を作り直さず、中身だけを替える", () => {
    const props = { importance: "medium", disabled: false, mixed: false, onChange: jest.fn() } as const;
    const { container, rerender } = render(<NodeImportanceSelector {...props} selectionCount={1} />);
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeEmptyDOMElement();

    rerender(<NodeImportanceSelector {...props} selectionCount={2} />);
    expect(container.querySelector('[aria-live="polite"]')).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent("2件選択中");

    rerender(<NodeImportanceSelector {...props} selectionCount={1} />);
    expect(container.querySelector('[aria-live="polite"]')).toBe(liveRegion);
    expect(liveRegion).toBeEmptyDOMElement();
  });

  it("混在時にボタンを押すとその重要度でonChangeを呼ぶ", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <NodeImportanceSelector
        importance={null}
        disabled={false}
        selectionCount={2}
        mixed
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "重要度 低" }));

    expect(onChange).toHaveBeenCalledWith("low");
  });
});
