import { fireEvent, render, screen } from "@testing-library/react";
import { TreeDirectionControl } from "@/components/layout/TreeDirectionControl";

describe("TreeDirectionControl", () => {
  it("選択肢を名前付きグループとして提供する", () => {
    render(
      <TreeDirectionControl
        treeDirection="lr"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByRole("group", { name: "ツリー方向" })).toBeInTheDocument();
  });

  it.each([
    [undefined, "左→右", "上→下"],
    ["lr", "左→右", "上→下"],
    ["tb", "上→下", "左→右"],
  ] as const)(
    "treeDirection=%s のとき選択表示を示す",
    (treeDirection, selectedLabel, idleLabel) => {
      render(
        <TreeDirectionControl
          treeDirection={treeDirection}
          onChange={jest.fn()}
        />,
      );

      expect(screen.getByRole("button", { name: selectedLabel })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: idleLabel })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    },
  );

  it("クリックした方向への変更を通知する", () => {
    const onChange = jest.fn();
    render(
      <TreeDirectionControl
        treeDirection="lr"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "上→下" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("tb");
  });

  it("disabledReason=manual では操作を無効にし、説明用ツールチップを付ける", () => {
    const onChange = jest.fn();
    const { container } = render(
      <TreeDirectionControl
        treeDirection="lr"
        disabled
        disabledReason="manual"
        onChange={onChange}
      />,
    );

    const group = screen.getByRole("group", { name: "ツリー方向" });
    expect(group).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "左→右" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "上→下" })).toBeDisabled();
    expect(container.firstChild).toHaveAttribute(
      "title",
      "ツリー方向は自動配置モードでのみ変更できます。手動配置では設定だけ保持し、座標は変わりません。",
    );

    fireEvent.click(screen.getByRole("button", { name: "上→下" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disabledReason=radial のときだけ放射用ツールチップを付ける", () => {
    const { container } = render(
      <TreeDirectionControl
        treeDirection="lr"
        disabled
        disabledReason="radial"
        onChange={jest.fn()}
      />,
    );

    expect(container.firstChild).toHaveAttribute(
      "title",
      "放射レイアウト中はツリー方向を変更できません。直交に戻すと再び使えます。",
    );
  });

  it("disabledReason=blocked ではツールチップを出さない", () => {
    const { container } = render(
      <TreeDirectionControl
        treeDirection="lr"
        disabled
        disabledReason="blocked"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "左→右" })).toBeDisabled();
    expect(container.firstChild).not.toHaveAttribute("title");
  });
});
