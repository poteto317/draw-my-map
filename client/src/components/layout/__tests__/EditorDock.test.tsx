import { createRef, useEffect } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  EditorDock,
  type EditorDockProps,
  type EditorDockSlot,
} from "@/components/layout/EditorDock";
import type { DockSlotId } from "@/domain/dock/dockSlotCatalog";

/** L-060: 必須 props が型上省略不可であることをコンパイル時に担保する参照 */
const REQUIRED_EDITOR_DOCK_PROP_KEYS = [
  "slots",
  "onCustomize",
  "customizeButtonRef",
  "isNarrowViewport",
] as const satisfies ReadonlyArray<keyof EditorDockProps>;

function slot(id: DockSlotId, label: string): EditorDockSlot {
  return {
    id,
    node: <button type="button">{label}</button>,
  };
}

function createProps(overrides: Partial<EditorDockProps> = {}): EditorDockProps {
  return {
    slots: [
      slot("undoRedo", "元に戻す"),
      slot("commandPalette", "コマンド"),
      slot("wheelZoom", "ズーム"),
    ],
    onCustomize: jest.fn(),
    customizeButtonRef: createRef<HTMLButtonElement>(),
    isNarrowViewport: false,
    ...overrides,
  };
}

describe("EditorDock", () => {
  it("L-060: 必須 props キーが揃っている（未配線 RED 用の正本）", () => {
    const props = createProps();
    for (const key of REQUIRED_EDITOR_DOCK_PROP_KEYS) {
      expect(props[key]).toBeDefined();
    }
    render(<EditorDock {...props} />);
    expect(screen.getByTestId("editor-dock")).toBeInTheDocument();
  });

  it("L-060 外し変異: 必須 props を欠落させると型エラー（コンパイル時）", () => {
    const full = createProps();
    // @ts-expect-error L-060: onCustomize は必須
    const missingCustomize: EditorDockProps = {
      slots: full.slots,
      customizeButtonRef: full.customizeButtonRef,
      isNarrowViewport: full.isNarrowViewport,
    };
    // @ts-expect-error L-060: customizeButtonRef は必須
    const missingRef: EditorDockProps = {
      slots: full.slots,
      onCustomize: full.onCustomize,
      isNarrowViewport: full.isNarrowViewport,
    };
    // @ts-expect-error L-060: isNarrowViewport は必須
    const missingNarrow: EditorDockProps = {
      slots: full.slots,
      onCustomize: full.onCustomize,
      customizeButtonRef: full.customizeButtonRef,
    };
    void missingCustomize;
    void missingRef;
    void missingNarrow;
    expect(REQUIRED_EDITOR_DOCK_PROP_KEYS).toContain("onCustomize");
    expect(REQUIRED_EDITOR_DOCK_PROP_KEYS).toContain("customizeButtonRef");
    expect(REQUIRED_EDITOR_DOCK_PROP_KEYS).toContain("isNarrowViewport");
  });

  it("testid editor-dock と .editor-dock 祖先クラスを持つ", () => {
    render(<EditorDock {...createProps()} />);
    const dock = screen.getByTestId("editor-dock");
    expect(dock).toHaveClass("editor-dock");
  });

  it("渡された slots を表示し、カスタマイズボタンを右端に出す", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<EditorDock {...props} />);

    expect(screen.getByRole("button", { name: "元に戻す" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "コマンド" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ズーム" })).toBeInTheDocument();

    const customize = screen.getByRole("button", { name: "カスタマイズ" });
    expect(props.customizeButtonRef.current).toBe(customize);
    await user.click(customize);
    expect(props.onCustomize).toHaveBeenCalledTimes(1);
  });

  it("はみ出し表示スロットのみ「その他」へ送り、slots に無い ID は出ない", () => {
    const slots: EditorDockSlot[] = [
      slot("undoRedo", "スロットA"),
      slot("commandPalette", "スロットB"),
      slot("wheelZoom", "スロットC"),
    ];
    const { container } = render(
      <EditorDock
        {...createProps({
          slots,
          primarySlotCount: 1,
        })}
      />,
    );

    const dock = screen.getByTestId("editor-dock");
    expect(within(dock).getByRole("button", { name: "スロットA" })).toBeInTheDocument();
    expect(within(dock).queryByRole("button", { name: "スロットB" })).not.toBeInTheDocument();
    expect(within(dock).queryByRole("button", { name: "スロットC" })).not.toBeInTheDocument();

    fireEvent.click(within(dock).getByRole("button", { name: "その他" }));
    const menu = screen.getByRole("group", { name: "その他の操作" });
    expect(within(menu).getByRole("button", { name: "スロットB" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "スロットC" })).toBeInTheDocument();
    expect(container.textContent).not.toContain("音声入力");
  });

  it("「その他」メニューは menuitem で button を包まない", () => {
    render(
      <EditorDock
        {...createProps({
          slots: [slot("undoRedo", "スロットA"), slot("commandPalette", "スロットB")],
          primarySlotCount: 1,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "その他" }));
    const menu = screen.getByRole("group", { name: "その他の操作" });
    expect(within(menu).queryByRole("menuitem")).not.toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "スロットB" })).toBeInTheDocument();
  });

  it("狭幅ではスロット帯に横スクロール用クラスを付ける", () => {
    render(<EditorDock {...createProps({ isNarrowViewport: true })} />);
    expect(screen.getByTestId("editor-dock-slots")).toHaveClass(
      "editor-dock__slots--scroll",
    );
  });

  it("狭幅でもはみ出したスロットは「その他」へ送り、横スクロール用クラスは残す", () => {
    const slots: EditorDockSlot[] = [
      slot("undoRedo", "スロットA"),
      slot("commandPalette", "スロットB"),
      slot("wheelZoom", "スロットC"),
    ];
    render(
      <EditorDock
        {...createProps({
          slots,
          isNarrowViewport: true,
          primarySlotCount: 1,
        })}
      />,
    );
    const dock = screen.getByTestId("editor-dock");
    expect(screen.getByTestId("editor-dock-slots")).toHaveClass(
      "editor-dock__slots--scroll",
    );
    expect(within(dock).getByRole("button", { name: "スロットA" })).toBeInTheDocument();
    expect(within(dock).queryByRole("button", { name: "スロットB" })).not.toBeInTheDocument();
    expect(within(dock).queryByRole("button", { name: "スロットC" })).not.toBeInTheDocument();

    fireEvent.click(within(dock).getByRole("button", { name: "その他" }));
    const menu = screen.getByRole("group", { name: "その他の操作" });
    expect(within(menu).getByRole("button", { name: "スロットB" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "スロットC" })).toBeInTheDocument();
  });

  it("overflowSlots が空になったら overflowOpen を閉じ、再出現時も閉じたまま", () => {
    const slots: EditorDockSlot[] = [
      slot("undoRedo", "スロットA"),
      slot("commandPalette", "スロットB"),
    ];
    const { rerender } = render(
      <EditorDock {...createProps({ slots, primarySlotCount: 1 })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "その他" }));
    expect(screen.getByRole("group", { name: "その他の操作" })).toBeInTheDocument();

    rerender(<EditorDock {...createProps({ slots, primarySlotCount: 2 })} />);
    expect(
      screen.queryByRole("button", { name: "その他" }),
    ).not.toBeInTheDocument();

    rerender(<EditorDock {...createProps({ slots, primarySlotCount: 1 })} />);
    const trigger = screen.getByRole("button", { name: "その他" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("group", { name: "その他の操作" }),
    ).not.toBeInTheDocument();
  });

  it("同一 slot node を二重マウントしない", () => {
    let mountCount = 0;
    function Probe() {
      useEffect(() => {
        mountCount += 1;
        return () => {
          mountCount -= 1;
        };
      }, []);
      return <button type="button">probe</button>;
    }

    render(
      <EditorDock
        {...createProps({
          slots: [{ id: "undoRedo", node: <Probe /> }],
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "probe" })).toBeInTheDocument();
    expect(mountCount).toBe(1);
  });

  it("スロット集合が増えたとき、短いときの計測値で後ろのスロットを隠さない", () => {
    // primarySlotCount 未指定時、初回は全表示。短い集合→長い集合へ差し替えても全表示のまま
    const shortSlots: EditorDockSlot[] = [
      slot("undoRedo", "スロットA"),
      slot("commandPalette", "スロットB"),
    ];
    const longSlots: EditorDockSlot[] = [
      slot("undoRedo", "スロットA"),
      slot("commandPalette", "スロットB"),
      slot("wheelZoom", "スロットC"),
      slot("importance", "スロットD"),
    ];
    const { rerender } = render(
      <EditorDock {...createProps({ slots: shortSlots })} />,
    );
    const dock = screen.getByTestId("editor-dock");
    expect(within(dock).getByRole("button", { name: "スロットA" })).toBeInTheDocument();
    expect(within(dock).getByRole("button", { name: "スロットB" })).toBeInTheDocument();

    rerender(<EditorDock {...createProps({ slots: longSlots })} />);
    expect(within(dock).getByRole("button", { name: "スロットC" })).toBeInTheDocument();
    expect(within(dock).getByRole("button", { name: "スロットD" })).toBeInTheDocument();
    expect(
      within(dock).queryByRole("button", { name: "その他" }),
    ).not.toBeInTheDocument();
  });
});
