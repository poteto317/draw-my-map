import { fireEvent, render, screen } from "@testing-library/react";
import { AppHeader } from "@/components/layout/AppHeader";

describe("AppHeader", () => {
  it("タイトル『Draw My Map』が表示される", () => {
    render(
      <AppHeader
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={null}
        mapControls={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "Draw My Map" })).toBeInTheDocument();
  });

  it("狭い画面で内容を複数行に折り返せる", () => {
    render(
      <AppHeader
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={null}
        mapControls={null}
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
        searchControls={null}
        mapControls={null}
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
        searchControls={null}
        mapControls={null}
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
        searchControls={null}
        mapControls={null}
        operationControls={<button type="button">保存操作</button>}
        operationNotices={<p role="status">保存通知</p>}
      />,
    );

    const header = screen.getByRole("banner");
    expect(header).toContainElement(screen.getByRole("button", { name: "保存操作" }));
    expect(header).toContainElement(screen.getByRole("status"));
    expect(screen.getByRole("status").parentElement).toHaveClass("w-full");
  });

  it("重要度・表示スロットを操作案内の後、操作コントロールの前へDOM順で配置する", () => {
    render(
      <AppHeader
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={<div data-testid="search-controls">検索</div>}
        mapControls={null}
        importanceControls={<div data-testid="importance-controls">重要度操作</div>}
        resolutionControls={<div data-testid="resolution-controls">表示操作</div>}
        operationControls={<button type="button">保存操作</button>}
      />,
    );

    const hint = screen.getByText(/ノードドラッグで移動/);
    const title = screen.getByRole("heading", { name: "Draw My Map" });
    const searchControls = screen.getByTestId("search-controls");
    const importanceControls = screen.getByTestId("importance-controls");
    const resolutionControls = screen.getByTestId("resolution-controls");
    const operationControls = screen.getByRole("button", { name: "保存操作" });

    expect(title.compareDocumentPosition(searchControls))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(searchControls.compareDocumentPosition(hint))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(hint.compareDocumentPosition(importanceControls))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(importanceControls.compareDocumentPosition(resolutionControls))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(resolutionControls.compareDocumentPosition(operationControls))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("マップ操作をh1の直後に描画する", () => {
    render(
      <AppHeader
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={<div data-testid="search-controls">検索</div>}
        mapControls={<div data-testid="map-controls">マップ操作</div>}
      />,
    );

    const title = screen.getByRole("heading", { name: "Draw My Map" });
    expect(title.nextElementSibling).toBe(screen.getByTestId("map-controls"));
  });
});
