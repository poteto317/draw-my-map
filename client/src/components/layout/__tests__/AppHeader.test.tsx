import { fireEvent, render, screen } from "@testing-library/react";
import { AppHeader } from "@/components/layout/AppHeader";

const defaultNarrowProps = {
  isNarrowViewport: false,
  userChoseMapOnNarrow: false,
} as const;

describe("AppHeader", () => {
  it("タイトル『Draw My Map』が表示される", () => {
    render(
      <AppHeader
        {...defaultNarrowProps}
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

  it("広幅ではヘッダー上段を複数行に折り返せる", () => {
    render(
      <AppHeader
        {...defaultNarrowProps}
        viewControls={null}
        showCanvasHints={true}
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={null}
        mapControls={null} saveStatus="saved"
      />,
    );

    const topRow = screen.getByTestId("header-primary");
    expect(topRow).toHaveClass("flex-wrap");
    expect(topRow).not.toHaveClass("overflow-x-auto");
  });

  it("狭幅ではヘッダー上段を横スクロールし先頭付近に表示モード・音声・保存を並べる", () => {
    render(
      <AppHeader
        isNarrowViewport
        userChoseMapOnNarrow={false}
        viewControls={<div data-testid="view-controls">表示</div>}
        voiceControls={<button type="button">音声入力</button>}
        showCanvasHints={false}
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={null}
        mapControls={null}
        saveStatus="saved"
      />,
    );

    const topRow = screen.getByTestId("header-primary");
    expect(topRow).toHaveClass("overflow-x-auto");
    expect(topRow).not.toHaveClass("flex-wrap");
    const viewControls = screen.getByTestId("view-controls");
    const voice = screen.getByRole("button", { name: "音声入力" });
    const save = screen.getByRole("status", { name: "保存状態: 保存済み" });
    expect(viewControls.compareDocumentPosition(voice)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(voice.compareDocumentPosition(save)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("高さ上限と縦スクロールで折り返し内容へ届く", () => {
    render(
      <AppHeader
        {...defaultNarrowProps}
        viewControls={null}
        showCanvasHints={true}
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={null}
        mapControls={null}
        saveStatus="saved"
        operationControls={<button type="button">保存操作</button>}
      />,
    );

    const banner = screen.getByRole("banner");
    expect(banner).toHaveClass("max-h-[40dvh]", "flex", "flex-col", "gap-4");
    expect(banner).not.toHaveClass("overflow-y-auto");
    expect(screen.getByTestId("header-operations-scroll")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
      "overscroll-y-contain",
    );
  });

  it("操作系スロットがすべて未指定のとき下段スクロール領域を描画しない", () => {
    render(
      <AppHeader
        {...defaultNarrowProps}
        viewControls={null}
        showCanvasHints={true}
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={null}
        mapControls={null}
        saveStatus="saved"
      />,
    );

    expect(screen.queryByTestId("header-operations-scroll")).not.toBeInTheDocument();
  });

  it("操作系スロットがすべて falsy のとき下段スクロール領域を描画しない", () => {
    render(
      <AppHeader
        {...defaultNarrowProps}
        viewControls={null}
        showCanvasHints={true}
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={null}
        mapControls={null}
        saveStatus="saved"
        importanceControls={false}
        resolutionControls={false}
        operationControls={false}
        operationNotices={false}
      />,
    );

    expect(screen.queryByTestId("header-operations-scroll")).not.toBeInTheDocument();
  });

  it("検索結果の absolute 配置をヘッダー overflow で切らない", () => {
    render(
      <AppHeader
        {...defaultNarrowProps}
        viewControls={null}
        showCanvasHints={true}
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
        searchControls={
          <div className="relative" data-testid="search-controls">
            <div role="listbox" className="absolute top-full z-10">
              検索結果
            </div>
          </div>
        }
        mapControls={null}
        saveStatus="saved"
        operationControls={<button type="button">保存操作</button>}
      />,
    );

    const banner = screen.getByRole("banner");
    expect(banner).not.toHaveClass("overflow-y-auto");
    const primary = screen.getByTestId("header-primary");
    const opsScroll = screen.getByTestId("header-operations-scroll");
    const search = screen.getByTestId("search-controls");
    expect(primary).toContainElement(search);
    expect(opsScroll).not.toContainElement(search);
    expect(screen.getByText("検索結果")).toBeInTheDocument();
  });

  it("モード選択を変更commandへ接続する", () => {
    const onLayoutModeChange = jest.fn();
    render(
      <AppHeader
        {...defaultNarrowProps}
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
        {...defaultNarrowProps}
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
        {...defaultNarrowProps}
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
        {...defaultNarrowProps}
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
        {...defaultNarrowProps}
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
  render(<AppHeader {...defaultNarrowProps} layoutMode="manual" onLayoutModeChange={jest.fn()} mapControls={null} saveStatus="saved" searchControls={null}
    viewControls={<button>アウトライン表示</button>} showCanvasHints={false} />);
  expect(screen.getByRole("button", { name: "アウトライン表示" })).toBeInTheDocument();
  expect(screen.queryByText(/空白ダブルクリックで追加/)).not.toBeInTheDocument();
});


it("通知がなくてもマップ操作の直後の通常行に保存状態を表示する", () => {
  render(<AppHeader {...defaultNarrowProps} layoutMode="manual" onLayoutModeChange={jest.fn()}
    mapControls={<button>マップ操作</button>} saveStatus="beforeSave"
    searchControls={null} viewControls={null} showCanvasHints={false} operationNotices={null} />);

  const mapControls = screen.getByRole("button", { name: "マップ操作" });
  const status = screen.getByRole("status", { name: "保存状態: 保存前" });
  expect(mapControls.nextElementSibling).toBe(status);
  expect(status).not.toHaveClass("w-full");
  expect(screen.queryByTestId("operation-notices")).not.toBeInTheDocument();
});

it("保存失敗通知だけを alert とし、保存状態を通知行より前に表示する", () => {
  render(<AppHeader {...defaultNarrowProps} layoutMode="manual" onLayoutModeChange={jest.fn()}
    mapControls={null} saveStatus="failed" searchControls={null} viewControls={null}
    showCanvasHints={false} operationNotices={<p role="alert">JSONで書き出してください。</p>} />);

  const status = screen.getByRole("status", { name: "保存状態: 保存失敗" });
  const alert = screen.getByRole("alert");
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(status.compareDocumentPosition(alert)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(screen.getByTestId("operation-notices")).toContainElement(alert);
});
