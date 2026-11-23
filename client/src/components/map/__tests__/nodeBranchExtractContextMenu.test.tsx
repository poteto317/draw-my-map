import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeContextMenu } from "@/components/map/NodeContextMenu";

describe("NodeContextMenu branch extract", () => {
  const baseProps = {
    position: { x: 0, y: 0 } as const,
    hasIllustration: false,
    onGenerateIllustration: jest.fn(),
  };

  it("extractVisible のとき項目を出し、disabled でないなら確認開始コールバックを呼ぶ", async () => {
    const onBeginExtract = jest.fn();
    render(
      <NodeContextMenu
        {...baseProps}
        extractVisible
        extractDisabled={false}
        onBeginBranchExtract={onBeginExtract}
      />,
    );
    const item = screen.getByRole("menuitem", { name: "枝を別マップに切り出す" });
    expect(item).toBeEnabled();
    await userEvent.click(item);
    expect(onBeginExtract).toHaveBeenCalledTimes(1);
    expect(baseProps.onGenerateIllustration).not.toHaveBeenCalled();
  });

  it("extractDisabled のとき項目は disabled", () => {
    render(
      <NodeContextMenu
        {...baseProps}
        extractVisible
        extractDisabled
        onBeginBranchExtract={jest.fn()}
      />,
    );
    expect(screen.getByRole("menuitem", { name: "枝を別マップに切り出す" })).toBeDisabled();
  });

  it("extractVisible が false のとき項目は出さない", () => {
    render(<NodeContextMenu {...baseProps} extractVisible={false} />);
    expect(screen.queryByRole("menuitem", { name: "枝を別マップに切り出す" })).not.toBeInTheDocument();
  });

  it("libraryMetaStatus 相当の理由では disabled にしない（呼び出し側が extractDisabled=false を渡す）", () => {
    render(
      <NodeContextMenu
        {...baseProps}
        extractVisible
        extractDisabled={false}
        onBeginBranchExtract={jest.fn()}
      />,
    );
    expect(screen.getByRole("menuitem", { name: "枝を別マップに切り出す" })).toBeEnabled();
  });
});