import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MapLibraryControls } from "@/components/layout/MapLibraryControls";

type Props = Parameters<typeof MapLibraryControls>[0];

function renderControls(overrides: Partial<Props> = {}) {
  const props: Props = {
    mapName: "旅行の計画",
    disabled: false,
    listExpanded: false,
    onOpenList: jest.fn(),
    onOpenCreate: jest.fn(),
    listButtonRef: createRef<HTMLButtonElement>(),
    createButtonRef: createRef<HTMLButtonElement>(),
    ...overrides,
  };
  render(<MapLibraryControls {...props} />);
  return props;
}

describe("MapLibraryControls", () => {
  it("現在のマップ名を表示し、titleに全文を持つ", () => {
    const longName = "あ".repeat(50);
    renderControls({ mapName: longName });

    const name = screen.getByTestId("current-map-name");
    expect(name).toHaveTextContent(`マップ: ${longName}`);
    expect(name).toHaveAttribute("title", longName);
    expect(name).toHaveClass("truncate");
  });

  it("ボタンの名前が見える文字と一致し、ダイアログを開くことを示す", () => {
    renderControls();

    const list = screen.getByRole("button", { name: "マップ一覧" });
    const create = screen.getByRole("button", { name: "新しいマップ" });
    expect(list).toHaveTextContent("マップ一覧");
    expect(create).toHaveTextContent("新しいマップ");
    expect(list).toHaveAttribute("aria-haspopup", "dialog");
    expect(create).toHaveAttribute("aria-haspopup", "dialog");
    expect(list).toHaveAttribute("type", "button");
    expect(create).toHaveAttribute("type", "button");
  });

  it("listExpandedでaria-expandedが切り替わる", () => {
    const { rerender } = render(
      <MapLibraryControls
        mapName="a"
        disabled={false}
        listExpanded={false}
        onOpenList={jest.fn()}
        onOpenCreate={jest.fn()}
        listButtonRef={createRef()}
        createButtonRef={createRef()}
      />,
    );
    const list = screen.getByRole("button", { name: "マップ一覧" });
    expect(list).toHaveAttribute("aria-expanded", "false");

    rerender(
      <MapLibraryControls
        mapName="a"
        disabled={false}
        listExpanded
        onOpenList={jest.fn()}
        onOpenCreate={jest.fn()}
        listButtonRef={createRef()}
        createButtonRef={createRef()}
      />,
    );
    expect(list).toHaveAttribute("aria-expanded", "true");
  });

  it("各ボタンのクリックでコールバックを呼ぶ", () => {
    const props = renderControls();

    fireEvent.click(screen.getByRole("button", { name: "マップ一覧" }));
    expect(props.onOpenList).toHaveBeenCalledTimes(1);
    expect(props.onOpenCreate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "新しいマップ" }));
    expect(props.onOpenCreate).toHaveBeenCalledTimes(1);
  });

  it("refを各ボタンへ渡す", () => {
    const props = renderControls();

    expect(props.listButtonRef).toHaveProperty(
      "current",
      screen.getByRole("button", { name: "マップ一覧" }),
    );
    expect(props.createButtonRef).toHaveProperty(
      "current",
      screen.getByRole("button", { name: "新しいマップ" }),
    );
  });

  it("通常時は無効理由を表示しない", () => {
    renderControls();

    expect(screen.queryByText("保存できないため、マップの切り替えは使えません。")).toBeNull();
  });

  it("disabledのとき両ボタンを無効にし、理由を表示する", () => {
    const props = renderControls({ disabled: true });

    expect(screen.getByRole("button", { name: "マップ一覧" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "新しいマップ" })).toBeDisabled();
    expect(
      screen.getByText("保存できないため、マップの切り替えは使えません。"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "マップ一覧" }));
    expect(props.onOpenList).not.toHaveBeenCalled();
  });

  it.each(["マップ一覧", "新しいマップ"])(
    "%sボタンはリピートのEnter・Spaceのkeydownを止め、単発は止めない",
    (name) => {
      renderControls();
      const button = screen.getByRole("button", { name });

      expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
      expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
      expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
      expect(fireEvent.keyDown(button, { key: " ", repeat: false })).toBe(true);
    },
  );

  it("フォーカスリングは既存のヘッダーのボタンと同じクラスを持つ", () => {
    renderControls();

    expect(screen.getByRole("button", { name: "マップ一覧" }).className)
      .toMatch(/focus-visible:outline-blue-600/);
  });
});
