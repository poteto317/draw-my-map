import { render, screen } from "@testing-library/react";
import HelpPage from "@/app/help/page";
import { LAYOUT_MODE_OPERATION_HINTS } from "@/domain/help/layoutModeOperationHints";

describe("HelpPage (/help)", () => {
  it("(a)(b)(c) の見出しがあり、旧常時テキストの内容を載せる", () => {
    const { container } = render(<HelpPage />);

    expect(container.querySelector(".help-page")).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "レイアウト操作ヒント" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "コピー／貼り付け案内" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "折りたたみ補足" }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(LAYOUT_MODE_OPERATION_HINTS.manual, { exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(LAYOUT_MODE_OPERATION_HINTS.auto, { exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "枝をコピー: Ctrl/Cmd+C ／ 貼り付け: Ctrl/Cmd+V（新しいルートとして追加）",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("折りたたみは保存・画像出力に反映されません。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("手動配置へ戻すと元の座標に戻ります。"),
    ).toBeInTheDocument();
  });
});
