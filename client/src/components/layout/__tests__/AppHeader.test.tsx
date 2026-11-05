import { fireEvent, render, screen } from "@testing-library/react";
import { AppHeader } from "@/components/layout/AppHeader";

describe("AppHeader", () => {
  it("タイトル『Draw My Map』が表示される", () => {
    render(
      <AppHeader
        viewControls={null}
        showCanvasHints={true}
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={null}
        mapControls={null} saveStatus="saved"
      />,
    );

    expect(screen.getByRole("heading", { name: "Draw My Map" })).toBeInTheDocument();
  });

  it("狭い画面で内容を複数行に折り返せる", () => {
    render(
      <AppHeader
        viewControls={null}
        showCanvasHints={true}
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={null}
        mapControls={null} saveStatus="saved"
      />,
    );

    expect(screen.getByRole("banner")).toHaveClass("flex-wrap");
  });

  it("モード選択を変更commandへ接続する", () => {
    const onLayoutModeChange = jest.fn();
    render(
      <AppHeader
        viewControls={null}
        showCanvasHints={true}
        layoutMode="manual"
        onLayoutModeChange={onLayoutModeChange}
        searchControls={null}
        mapControls={null} saveStatus="saved"
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
        viewControls={null}
        showCanvasHints={true}
        layoutMode={layoutMode}
        onLayoutModeChange={jest.fn()}
        searchControls={null}
        mapControls={null} saveStatus="saved"
      />,
    );

    const header = screen.getByRole("banner");
    expect(header).toContainElement(screen.getByText(expectedHint));
  });

  it("操作コントロールと通知をヘッダー内へ配置する", () => {
    render(
      <AppHeader
        viewControls={null}
        showCanvasHints={true}
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={null}
        mapControls={null} saveStatus="saved"
        operationControls={<button type="button">保存操作</button>}
        operationNotices={<p role="status">保存通知</p>}
      />,
    );

    const header = screen.getByRole("banner");
    expect(header).toContainElement(screen.getByRole("button", { name: "保存操作" }));
    expect(header).toContainElement(screen.getByRole("status", { name: "保存状態: 保存済み" }));
    expect(screen.getByTestId("operation-notices")).toHaveClass("w-full");
  });

  it("重要度・表示スロットを操作案内の後、操作コントロールの前へDOM順で配置する", () => {
    render(
      <AppHeader
        viewControls={null}
        showCanvasHints={true}
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={<div data-testid="search-controls">検索</div>}
        mapControls={null} saveStatus="saved"
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
        viewControls={null}
        showCanvasHints={true}
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={<div data-testid="search-controls">検索</div>}
        mapControls={<div data-testid="map-controls">マップ操作</div>} saveStatus="saved"
      />,
    );

    const title = screen.getByRole("heading", { name: "Draw My Map" });
    expect(title.nextElementSibling).toBe(screen.getByTestId("map-controls"));
  });
});

it("outlineのview controlsを表示しcanvasヒントを隠す", () => {
  render(<AppHeader layoutMode="manual" onLayoutModeChange={jest.fn()} mapControls={null} saveStatus="saved" searchControls={null}
    viewControls={<button>アウトライン表示</button>} showCanvasHints={false} />);
  expect(screen.getByRole("button", { name: "アウトライン表示" })).toBeInTheDocument();
  expect(screen.queryByText(/空白ダブルクリックで追加/)).not.toBeInTheDocument();
});


it("通知がなくてもマップ操作の直後の通常行に保存状態を表示する", () => {
  render(<AppHeader layoutMode="manual" onLayoutModeChange={jest.fn()}
    mapControls={<button>マップ操作</button>} saveStatus="beforeSave"
    searchControls={null} viewControls={null} showCanvasHints={false} operationNotices={null} />);

  const mapControls = screen.getByRole("button", { name: "マップ操作" });
  const status = screen.getByRole("status", { name: "保存状態: 保存前" });
  expect(mapControls.nextElementSibling).toBe(status);
  expect(status).not.toHaveClass("w-full");
  expect(screen.queryByTestId("operation-notices")).not.toBeInTheDocument();
});

it("保存失敗通知だけを alert とし、保存状態を通知行より前に表示する", () => {
  render(<AppHeader layoutMode="manual" onLayoutModeChange={jest.fn()}
    mapControls={null} saveStatus="failed" searchControls={null} viewControls={null}
    showCanvasHints={false} operationNotices={<p role="alert">JSONで書き出してください。</p>} />);

  const status = screen.getByRole("status", { name: "保存状態: 保存失敗" });
  const alert = screen.getByRole("alert");
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(status.compareDocumentPosition(alert)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(screen.getByTestId("operation-notices")).toContainElement(alert);
});
