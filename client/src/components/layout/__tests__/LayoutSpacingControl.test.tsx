import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_LAYOUT_SPACING } from "@/domain/persistence/mapDocumentLayoutSpacing";
import { LayoutSpacingControl } from "@/components/layout/LayoutSpacingControl";

describe("LayoutSpacingControl", () => {
  it("メニューを開くと子・兄弟間隔の数値入力を表示する", async () => {
    const user = userEvent.setup();
    render(
      <LayoutSpacingControl
        layoutMode="auto"
        layoutSpacing={DEFAULT_LAYOUT_SPACING}
        selectionActive
        onChange={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "配置間隔" }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByLabelText("子方向の間隔")).toHaveValue(120);
    expect(screen.getByLabelText("兄弟方向の間隔")).toHaveValue(40);
  });

  it("layoutSpacing が未設定のとき既定値を表示する", async () => {
    const user = userEvent.setup();
    render(
      <LayoutSpacingControl
        layoutMode="auto"
        layoutSpacing={undefined}
        selectionActive
        onChange={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "配置間隔" }));

    expect(screen.getByLabelText("子方向の間隔")).toHaveValue(
      DEFAULT_LAYOUT_SPACING.childGap,
    );
    expect(screen.getByLabelText("兄弟方向の間隔")).toHaveValue(
      DEFAULT_LAYOUT_SPACING.siblingGap,
    );
  });

  it("変更時にクリップした値を onChange へ渡す", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <LayoutSpacingControl
        layoutMode="auto"
        layoutSpacing={DEFAULT_LAYOUT_SPACING}
        selectionActive
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "配置間隔" }));
    const childInput = screen.getByLabelText("子方向の間隔");
    fireEvent.change(childInput, { target: { value: "500" } });
    fireEvent.blur(childInput);

    expect(onChange).toHaveBeenCalledWith({ childGap: 400, siblingGap: 40 });
  });

  it("手動配置では操作可能で説明用ツールチップを付ける", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { container } = render(
      <LayoutSpacingControl
        layoutMode="manual"
        layoutSpacing={DEFAULT_LAYOUT_SPACING}
        selectionActive
        onChange={onChange}
      />,
    );

    const opener = screen.getByRole("button", { name: "配置間隔" });
    expect(opener).not.toBeDisabled();
    expect(container.firstChild).toHaveAttribute(
      "title",
      "手動配置では間隔の値だけ保存され、座標は変わりません。自動配置では変更に合わせて再配置されます。",
    );

    await user.click(opener);
    const childInput = screen.getByLabelText("子方向の間隔");
    fireEvent.change(childInput, { target: { value: "100" } });
    fireEvent.blur(childInput);

    expect(onChange).toHaveBeenCalledWith({ childGap: 100, siblingGap: 40 });
  });

  it("選択が消えると開いていたメニューを閉じる（L-214）", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <LayoutSpacingControl
        layoutMode="auto"
        layoutSpacing={DEFAULT_LAYOUT_SPACING}
        selectionActive
        onChange={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "配置間隔" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    rerender(
      <LayoutSpacingControl
        layoutMode="auto"
        layoutSpacing={DEFAULT_LAYOUT_SPACING}
        selectionActive={false}
        onChange={jest.fn()}
      />,
    );

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "配置間隔" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});