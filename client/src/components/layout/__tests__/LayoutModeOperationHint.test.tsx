import { render, screen } from "@testing-library/react";
import { LayoutModeOperationHint } from "@/components/layout/LayoutModeOperationHint";

describe("LayoutModeOperationHint", () => {
  it("手動モードではノードのドラッグ移動を案内する", () => {
    render(<LayoutModeOperationHint layoutMode="manual" />);

    const hint = screen.getByText(/ノードドラッグで移動/);
    expect(hint).toHaveClass("text-zinc-600", "dark:text-zinc-400");
  });

  it("自動モードでは自動整列を案内する", () => {
    render(<LayoutModeOperationHint layoutMode="auto" />);

    expect(screen.getByText(/追加・削除・接続時に自動整列/))
      .toBeInTheDocument();
  });

  it("自動モードではノードのドラッグ移動を案内しない", () => {
    render(<LayoutModeOperationHint layoutMode="auto" />);

    expect(screen.queryByText(/ノードドラッグで移動/))
      .not.toBeInTheDocument();
  });
});
