import { render, screen } from "@testing-library/react";
import { AppHeader } from "@/components/layout/AppHeader";

describe("AppHeader", () => {
  it("タイトル『Draw My Map』が表示される", () => {
    render(<AppHeader />);
    expect(screen.getByRole("heading", { name: "Draw My Map" })).toBeInTheDocument();
  });

  it("操作ヒントが表示される", () => {
    render(<AppHeader />);
    expect(
      screen.getByText(
        "ダブルクリックで追加・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続",
      ),
    ).toBeInTheDocument();
  });
});
