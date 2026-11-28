import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppHeader } from "@/components/layout/AppHeader";

const defaultNarrowProps = {
  isNarrowViewport: false,
  userChoseMapOnNarrow: false,
} as const;

const baseProps = {
  ...defaultNarrowProps,
  viewControls: null as ReactNode,
  layoutMode: "manual" as const,
  onLayoutModeChange: jest.fn(),
  searchControls: null as ReactNode,
  mapControls: null as ReactNode,
  saveStatus: "saved" as const,
};

describe("AppHeader", () => {
  it("タイトル『Draw My Map』が表示される", () => {
    render(<AppHeader {...baseProps} />);

    expect(screen.getByRole("heading", { name: "Draw My Map" })).toBeInTheDocument();
  });

  it("広幅ではヘッダー上段を複数行に折り返せる", () => {
    render(<AppHeader {...baseProps} />);

    const topRow = screen.getByTestId("header-primary");
    expect(topRow).toHaveClass("flex-wrap");
    expect(topRow).not.toHaveClass("overflow-x-auto");
  });

  it("狭幅ではヘッダー上段を横スクロールし先頭付近に表示モード・保存を並べる（音声は primary に出さない）", () => {
    render(
      <AppHeader
        isNarrowViewport
        userChoseMapOnNarrow={false}
        viewControls={<div data-testid="view-controls">表示</div>}
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
    const save = screen.getByRole("status", { name: "保存状態: 保存済み" });
    expect(viewControls.compareDocumentPosition(save)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByRole("button", { name: "音声入力" })).not.toBeInTheDocument();
  });

  it("header-operations-scroll を描画しない", () => {
    render(
      <AppHeader
        {...baseProps}
        operationNotices={<p role="status">通知</p>}
      />,
    );

    expect(screen.queryByTestId("header-operations-scroll")).not.toBeInTheDocument();
  });

  it("使い方リンクが primary 内に 1 つあり同一タブ（target=_blank 禁止）", () => {
    render(<AppHeader {...baseProps} />);

    const links = screen.getAllByRole("link", { name: "使い方" });
    expect(links).toHaveLength(1);
    const help = links[0];
    expect(help).toHaveAttribute("href", "/help");
    expect(help).not.toHaveAttribute("target");
    expect(screen.getByTestId("header-primary")).toContainElement(help);
  });

  it("操作ヒントの常時表示が無い", () => {
    render(<AppHeader {...baseProps} layoutMode="manual" />);

    expect(screen.queryByText(/ノードドラッグで移動/)).not.toBeInTheDocument();
    expect(screen.queryByText(/追加・削除・接続時に自動整列/)).not.toBeInTheDocument();
    expect(screen.queryByText(/空白ダブルクリックで追加/)).not.toBeInTheDocument();
  });

  it("決めたこと2の上部残置が primary に残る", () => {
    render(
      <AppHeader
        {...baseProps}
        mapControls={<div data-testid="map-controls">マップ操作</div>}
        viewControls={<div data-testid="view-controls">表示切替</div>}
        searchControls={<div data-testid="search-controls">検索</div>}
        layoutDirectionControls={<div data-testid="layout-direction">レイアウト系</div>}
      />,
    );

    const primary = screen.getByTestId("header-primary");
    expect(primary).toContainElement(screen.getByRole("heading", { name: "Draw My Map" }));
    expect(primary).toContainElement(screen.getByTestId("map-controls"));
    expect(primary).toContainElement(screen.getByRole("status", { name: "保存状態: 保存済み" }));
    expect(primary).toContainElement(screen.getByTestId("view-controls"));
    expect(primary).toContainElement(screen.getByTestId("search-controls"));
    expect(primary).toContainElement(screen.getByRole("button", { name: "手動配置" }));
    expect(primary).toContainElement(screen.getByTestId("layout-direction"));
    expect(primary).toContainElement(screen.getByRole("link", { name: "使い方" }));
  });

  it("検索結果の absolute 配置をヘッダー overflow で切らない", () => {
    render(
      <AppHeader
        {...baseProps}
        searchControls={
          <div className="relative" data-testid="search-controls">
            <div role="listbox" className="absolute top-full z-10">
              検索結果
            </div>
          </div>
        }
      />,
    );

    const banner = screen.getByRole("banner");
    expect(banner).not.toHaveClass("overflow-y-auto");
    const primary = screen.getByTestId("header-primary");
    const search = screen.getByTestId("search-controls");
    expect(primary).toContainElement(search);
    expect(screen.getByText("検索結果")).toBeInTheDocument();
  });

  it("モード選択を変更commandへ接続する", () => {
    const onLayoutModeChange = jest.fn();
    render(
      <AppHeader
        {...baseProps}
        onLayoutModeChange={onLayoutModeChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "自動配置" }));

    expect(onLayoutModeChange).toHaveBeenCalledTimes(1);
    expect(onLayoutModeChange).toHaveBeenCalledWith("auto");
  });

  it("operationNotices を primary の次行（全幅）に配置する", () => {
    render(
      <AppHeader
        {...baseProps}
        operationNotices={<p role="status">保存通知</p>}
      />,
    );

    const header = screen.getByRole("banner");
    const primary = screen.getByTestId("header-primary");
    const notices = screen.getByTestId("operation-notices");
    expect(header).toContainElement(notices);
    expect(notices).toHaveClass("w-full");
    expect(primary.compareDocumentPosition(notices)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(header).toContainElement(screen.getByRole("status", { name: "保存状態: 保存済み" }));
  });

  it("マップ操作をh1の直後に描画する", () => {
    render(
      <AppHeader
        {...baseProps}
        mapControls={<div data-testid="map-controls">マップ操作</div>}
      />,
    );

    const title = screen.getByRole("heading", { name: "Draw My Map" });
    expect(title.nextElementSibling).toBe(screen.getByTestId("map-controls"));
  });
});

it("outlineのview controlsを表示する", () => {
  render(
    <AppHeader
      {...defaultNarrowProps}
      layoutMode="manual"
      onLayoutModeChange={jest.fn()}
      mapControls={null}
      saveStatus="saved"
      searchControls={null}
      viewControls={<button type="button">アウトライン表示</button>}
    />,
  );
  expect(screen.getByRole("button", { name: "アウトライン表示" })).toBeInTheDocument();
  expect(screen.queryByText(/空白ダブルクリックで追加/)).not.toBeInTheDocument();
});

it("通知がなくてもマップ操作の直後の通常行に保存状態を表示する", () => {
  render(
    <AppHeader
      {...defaultNarrowProps}
      layoutMode="manual"
      onLayoutModeChange={jest.fn()}
      mapControls={<button type="button">マップ操作</button>}
      saveStatus="beforeSave"
      searchControls={null}
      viewControls={null}
      operationNotices={null}
    />,
  );

  const mapControls = screen.getByRole("button", { name: "マップ操作" });
  const status = screen.getByRole("status", { name: "保存状態: 保存前" });
  expect(mapControls.nextElementSibling).toBe(status);
  expect(status).not.toHaveClass("w-full");
  expect(screen.queryByTestId("operation-notices")).not.toBeInTheDocument();
});

it("保存失敗通知だけを alert とし、保存状態を通知行より前に表示する（L-166 表示枠）", () => {
  render(
    <AppHeader
      {...defaultNarrowProps}
      layoutMode="manual"
      onLayoutModeChange={jest.fn()}
      mapControls={null}
      saveStatus="failed"
      searchControls={null}
      viewControls={null}
      operationNotices={<p role="alert">JSONで書き出してください。</p>}
    />,
  );

  const status = screen.getByRole("status", { name: "保存状態: 保存失敗" });
  const alert = screen.getByRole("alert");
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(status.compareDocumentPosition(alert)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(screen.getByTestId("operation-notices")).toContainElement(alert);
});
