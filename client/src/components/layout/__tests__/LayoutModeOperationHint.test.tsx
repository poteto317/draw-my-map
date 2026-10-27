import { render, screen } from "@testing-library/react";
import { LayoutModeOperationHint } from "@/components/layout/LayoutModeOperationHint";

const manualHint =
  "空白ダブルクリックで追加・ノードダブルクリックで編集・ノードドラッグで移動・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更・Alt(Option)+←/→で階層を上げ下げ・Alt(Option)+Enterで親を挿入";
const autoHint =
  "空白ダブルクリックで追加・ノードダブルクリックで編集・追加・削除・接続時に自動整列・ノードドラッグで兄弟の順序を変更・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更・Alt(Option)+←/→で階層を上げ下げ・Alt(Option)+Enterで親を挿入";

describe("LayoutModeOperationHint", () => {
  it("手動モードでは手動モードの操作ヒントの全文を出す", () => {
    render(<LayoutModeOperationHint layoutMode="manual" />);

    expect(screen.getByText(manualHint, { exact: true })).toBeInTheDocument();
  });

  it("自動モードでは自動モードの操作ヒントの全文を出す", () => {
    render(<LayoutModeOperationHint layoutMode="auto" />);

    expect(screen.getByText(autoHint, { exact: true })).toBeInTheDocument();
  });

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
