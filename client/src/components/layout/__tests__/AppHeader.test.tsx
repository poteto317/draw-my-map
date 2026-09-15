import { render, screen } from "@testing-library/react";
import { AppHeader } from "@/components/layout/AppHeader";

describe("AppHeader", () => {
  it("タイトル『Draw My Map』が表示される", () => {
    render(<AppHeader />);
    expect(screen.getByRole("heading", { name: "Draw My Map" })).toBeInTheDocument();
  });

  it("操作ヒントが表示される", () => {
    render(<AppHeader />);
    const operationHint = screen.getByText(
      "空白ダブルクリックで追加・ノードダブルクリックで編集・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続",
    );

    expect(operationHint).toBeInTheDocument();
    expect(operationHint).toHaveClass("text-zinc-600", "dark:text-zinc-400");
  });
});
