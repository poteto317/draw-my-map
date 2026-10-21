import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeCollapseControl } from "@/components/layout/NodeCollapseControl";

describe("NodeCollapseControl", () => {
  it.each([
    ["未選択", null, true],
    ["葉", 12, false],
  ] as const)("%sではボタンを無効化し、toggleを実行しない", async (_case, selectedNodeId, canToggle) => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    render(
      <NodeCollapseControl
        selectedNodeId={selectedNodeId}
        canToggle={canToggle}
        collapsed={false}
        hiddenCount={0}
        onToggle={onToggle}
      />,
    );

    const button = screen.getByRole("button", { name: "枝を折りたたむ" });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute("aria-expanded");
    await user.click(button);

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("選択中の親IDで枝を折りたたむ", async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    render(
      <NodeCollapseControl
        selectedNodeId={24}
        canToggle
        collapsed={false}
        hiddenCount={0}
        onToggle={onToggle}
      />,
    );

    const button = screen.getByRole("button", { name: "枝を折りたたむ" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-expanded", "true");
    await user.click(button);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(24);
  });

  it("閉状態では展開操作と非表示件数を示す", () => {
    render(
      <NodeCollapseControl
        selectedNodeId={24}
        canToggle
        collapsed
        hiddenCount={17}
        onToggle={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "枝を展開" }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("折りたたみで非表示: 17件")).toBeInTheDocument();
  });

  it("非表示件数と補足をボタンの説明として結び付ける", () => {
    render(
      <NodeCollapseControl
        selectedNodeId={24}
        canToggle
        collapsed
        hiddenCount={17}
        onToggle={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "枝を展開" })).toHaveAccessibleDescription(
      "折りたたみで非表示: 17件 折りたたみは保存・画像出力に反映されません。 手動配置へ戻すと元の座標に戻ります。",
    );
  });

  it("props更新後は最新の選択IDでtoggleする", async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    const { rerender } = render(
      <NodeCollapseControl
        selectedNodeId={24}
        canToggle
        collapsed={false}
        hiddenCount={0}
        onToggle={onToggle}
      />,
    );

    rerender(
      <NodeCollapseControl
        selectedNodeId={36}
        canToggle
        collapsed={false}
        hiddenCount={0}
        onToggle={onToggle}
      />,
    );
    await user.click(screen.getByRole("button", { name: "枝を折りたたむ" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(36);
  });

  it("保存・画像出力と手動配置へ戻す場合の補足を示す", () => {
    render(
      <NodeCollapseControl
        selectedNodeId={null}
        canToggle={false}
        collapsed={false}
        hiddenCount={0}
        onToggle={jest.fn()}
      />,
    );

    expect(screen.getByText("折りたたみは保存・画像出力に反映されません。"))
      .toBeInTheDocument();
    expect(screen.getByText("手動配置へ戻すと元の座標に戻ります。"))
      .toBeInTheDocument();
  });

  it("Enterの押し続けのリピートを止める", () => {
    render(
      <NodeCollapseControl
        selectedNodeId={24}
        canToggle
        collapsed={false}
        hiddenCount={0}
        onToggle={jest.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: "枝を折りたたむ" });

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
  });

  it("単発のEnterとSpaceのリピートは止めない", () => {
    render(
      <NodeCollapseControl
        selectedNodeId={24}
        canToggle
        collapsed={false}
        hiddenCount={0}
        onToggle={jest.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: "枝を折りたたむ" });

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
    expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(true);
  });
});
