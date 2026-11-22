import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_LAYOUT_SNAP_PREFS } from "@/domain/nodes/snapGrid";
import { SnapGridControl } from "@/components/layout/SnapGridControl";

describe("SnapGridControl", () => {
  it("手動配置でメニューを開き設定を表示する", async () => {
    const user = userEvent.setup();
    render(
      <SnapGridControl
        layoutMode="manual"
        selectionActive
        prefs={DEFAULT_LAYOUT_SNAP_PREFS}
        onEnabledChange={jest.fn()}
        onShowGridChange={jest.fn()}
        onGridStepChange={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "グリッド・スナップ" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByLabelText("スナップ")).toBeChecked();
    expect(screen.getByLabelText("グリッド間隔")).toHaveValue(8);
  });

  it("自動配置ではコントロールを表示しない", () => {
    const { container } = render(
      <SnapGridControl
        layoutMode="auto"
        selectionActive
        prefs={DEFAULT_LAYOUT_SNAP_PREFS}
        onEnabledChange={jest.fn()}
        onShowGridChange={jest.fn()}
        onGridStepChange={jest.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("gridStep 変更時にクリップした値を渡す", async () => {
    const user = userEvent.setup();
    const onGridStepChange = jest.fn();
    render(
      <SnapGridControl
        layoutMode="manual"
        selectionActive
        prefs={DEFAULT_LAYOUT_SNAP_PREFS}
        onEnabledChange={jest.fn()}
        onShowGridChange={jest.fn()}
        onGridStepChange={onGridStepChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "グリッド・スナップ" }));
    const input = screen.getByLabelText("グリッド間隔");
    await user.clear(input);
    await user.type(input, "10");
    fireEvent.blur(input);

    expect(onGridStepChange).toHaveBeenCalledWith(12);
  });

  it("選択が消えると開いていたメニューを閉じる（L-214）", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SnapGridControl
        layoutMode="manual"
        selectionActive
        prefs={DEFAULT_LAYOUT_SNAP_PREFS}
        onEnabledChange={jest.fn()}
        onShowGridChange={jest.fn()}
        onGridStepChange={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "グリッド・スナップ" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    rerender(
      <SnapGridControl
        layoutMode="manual"
        selectionActive={false}
        prefs={DEFAULT_LAYOUT_SNAP_PREFS}
        onEnabledChange={jest.fn()}
        onShowGridChange={jest.fn()}
        onGridStepChange={jest.fn()}
      />,
    );

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});