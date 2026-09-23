import { fireEvent, render, screen } from "@testing-library/react";
import { AppHeader } from "@/components/layout/AppHeader";

describe("AppHeader", () => {
  it("タイトル『Draw My Map』が表示される", () => {
    render(
      <AppHeader
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Draw My Map" })).toBeInTheDocument();
  });

  it("狭い画面で内容を複数行に折り返せる", () => {
    render(
      <AppHeader
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
      />,
    );

    expect(screen.getByRole("banner")).toHaveClass("flex-wrap");
  });

  it("モード選択を変更commandへ接続する", () => {
    const onLayoutModeChange = jest.fn();
    render(
      <AppHeader
        layoutMode="manual"
        onLayoutModeChange={onLayoutModeChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "自動配置" }));

    expect(onLayoutModeChange).toHaveBeenCalledTimes(1);
    expect(onLayoutModeChange).toHaveBeenCalledWith("auto");
  });

  it.each([
    ["manual", /ノードドラッグで移動/],
    ["auto", /追加・削除・接続時に自動整列/],
  ] as const)("%sモードの操作案内を組み込む", (layoutMode, expectedHint) => {
    render(
      <AppHeader
        layoutMode={layoutMode}
        onLayoutModeChange={jest.fn()}
      />,
    );

    const header = screen.getByRole("banner");
    expect(header).toContainElement(screen.getByText(expectedHint));
  });

  it("操作コントロールと通知をヘッダー内へ配置する", () => {
    render(
      <AppHeader
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        operationControls={<button type="button">保存操作</button>}
        operationNotices={<p role="status">保存通知</p>}
      />,
    );

    const header = screen.getByRole("banner");
    expect(header).toContainElement(screen.getByRole("button", { name: "保存操作" }));
    expect(header).toContainElement(screen.getByRole("status"));
    expect(screen.getByRole("status").parentElement).toHaveClass("w-full");
  });
});
