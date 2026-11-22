import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectionAlignMenu } from "@/components/layout/SelectionAlignMenu";

describe("SelectionAlignMenu", () => {
  it("手動配置でメニューを開き整列項目を表示する", async () => {
    const user = userEvent.setup();
    render(
      <SelectionAlignMenu
        layoutMode="manual"
        selectionActive
        disabled={false}
        onAlign={jest.fn()}
        onDistribute={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "整列・等間隔" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "左揃え" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "水平" })).toBeInTheDocument();
  });

  it("自動配置ではボタンを無効化する", () => {
    render(
      <SelectionAlignMenu
        layoutMode="auto"
        selectionActive
        disabled={false}
        onAlign={jest.fn()}
        onDistribute={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "整列・等間隔" })).toBeDisabled();
  });

  it("選択が消えると開いていたメニューを閉じる（L-214）", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SelectionAlignMenu
        layoutMode="manual"
        selectionActive
        disabled={false}
        onAlign={jest.fn()}
        onDistribute={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "整列・等間隔" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    rerender(
      <SelectionAlignMenu
        layoutMode="manual"
        selectionActive={false}
        disabled={false}
        onAlign={jest.fn()}
        onDistribute={jest.fn()}
      />,
    );

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "整列・等間隔" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});