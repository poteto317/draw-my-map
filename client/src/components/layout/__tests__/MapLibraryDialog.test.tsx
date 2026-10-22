import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapLibraryDialog } from "@/components/layout/MapLibraryDialog";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";

type Props = Parameters<typeof MapLibraryDialog>[0];

const maps: MapIndexEntry[] = [
  {
    id: "a",
    name: "A",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-21T03:00:00.000Z",
  },
  {
    id: "b",
    name: "B",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-20T03:00:00.000Z",
  },
];

function createProps(overrides: Partial<Props> = {}): Props {
  return {
    screen: { kind: "list" },
    maps,
    currentMapId: "a",
    notices: { status: "", alert: "", sequence: 0 },
    focusTarget: null,
    onFocusTargetApplied: jest.fn(),
    onEscape: jest.fn(),
    onClose: jest.fn(),
    onOpenCreate: jest.fn(),
    onOpenRename: jest.fn(),
    onOpenDelete: jest.fn(),
    onSwitch: jest.fn(),
    onCancel: jest.fn(),
    onSubmitCreate: jest.fn(),
    onSubmitRename: jest.fn(),
    onConfirmDelete: jest.fn(),
    onMouseClick: jest.fn(),
    ...overrides,
  };
}

describe("MapLibraryDialog", () => {
  it("role=dialog と aria-modal を持ち、画面によらない固定の名前が付く", () => {
    render(<MapLibraryDialog {...createProps()} />);

    const dialog = screen.getByRole("dialog", { name: "マップの管理" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("group", { name: "マップ一覧" })).toBeInTheDocument();
  });

  // ダイアログの要素は画面が変わっても同じなので、画面ごとの group にフォーカスが入ったときに
  // group の名前（見出し）と説明が読まれるようにする
  it.each([
    [{ kind: "list" } as const, "マップ一覧", () => screen.getByRole("button", { name: /^A/ }), null],
    [{ kind: "create", origin: "list" } as const, "新しいマップ", () => screen.getByRole("textbox", { name: "マップ名" }), null],
    [{ kind: "rename", mapId: "b" } as const, "マップ名を変更", () => screen.getByRole("textbox", { name: "マップ名" }), null],
    [
      { kind: "delete", mapId: "b" } as const,
      "マップを削除",
      () => screen.getByRole("button", { name: "キャンセル" }),
      "マップ「B」を削除します。削除したマップは元に戻せません。",
    ],
  ])("%o の画面の既定のフォーカス先は、見出しを名前に持つ group の中にある", async (screenState, name, focused, description) => {
    render(
      <MapLibraryDialog
        {...createProps({ screen: screenState, focusTarget: { kind: "screenDefault" } })}
      />,
    );

    const group = screen.getByRole("group", { name });
    await waitFor(() => expect(focused()).toHaveFocus());
    expect(group).toContainElement(focused());
    if (description === null) {
      expect(group).not.toHaveAttribute("aria-describedby");
    } else {
      expect(group).toHaveAccessibleDescription(description);
    }
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby");
  });

  it("画面が変わると、group は新しい要素に作り直される", () => {
    const props = createProps();
    const { rerender } = render(<MapLibraryDialog {...props} />);
    const listGroup = screen.getByRole("group", { name: "マップ一覧" });

    rerender(<MapLibraryDialog {...props} screen={{ kind: "delete", mapId: "b" }} />);

    expect(screen.getByRole("group", { name: "マップを削除" })).not.toBe(listGroup);
    expect(listGroup).not.toBeInTheDocument();
  });

  it.each([
    [{ kind: "create", origin: "list" } as const, "新しいマップ"],
    [{ kind: "rename", mapId: "b" } as const, "マップ名を変更"],
    [{ kind: "delete", mapId: "b" } as const, "マップを削除"],
  ])("%o の画面は見出しで名前が付き、キャンセルで onCancel を呼ぶ", async (screenState, name) => {
    const user = userEvent.setup();
    const props = createProps({ screen: screenState });
    render(<MapLibraryDialog {...props} />);

    const group = screen.getByRole("group", { name });
    await user.click(within(group).getByRole("button", { name: "キャンセル" }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("notices を変えても status と alert の要素は同じ DOM ノードのまま文言だけが変わる", async () => {
    const props = createProps();
    const { rerender } = render(<MapLibraryDialog {...props} />);
    const status = screen.getByRole("status");
    const alert = screen.getByRole("alert");
    expect(status).toHaveTextContent("");
    expect(alert).toHaveTextContent("");

    rerender(
      <MapLibraryDialog
        {...props}
        screen={{ kind: "rename", mapId: "b" }}
        notices={{ status: "名前を変更しました。", alert: "保存できませんでした。", sequence: 1 }}
      />,
    );

    await waitFor(() => expect(status).toHaveTextContent("名前を変更しました。"));
    expect(alert).toHaveTextContent("保存できませんでした。");
    expect(screen.getByRole("status")).toBe(status);
    expect(screen.getByRole("alert")).toBe(alert);
  });

  describe("同じ文言の通知が続いたとき", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    function flushFrame() {
      act(() => {
        jest.advanceTimersToNextFrame();
      });
    }

    it("sequence が変わると、同じ DOM ノードのまま一度空にしてから次のフレームで同じ文言を入れ直す", () => {
      const props = createProps();
      const { rerender } = render(<MapLibraryDialog {...props} />);
      const alert = screen.getByRole("alert");
      const failure = { status: "", alert: "保存できませんでした。" };

      rerender(<MapLibraryDialog {...props} notices={{ ...failure, sequence: 1 }} />);
      flushFrame();
      expect(alert).toHaveTextContent("保存できませんでした。");

      rerender(<MapLibraryDialog {...props} notices={{ ...failure, sequence: 2 }} />);
      expect(alert).toBeEmptyDOMElement();

      flushFrame();
      expect(alert).toHaveTextContent("保存できませんでした。");
      expect(screen.getByRole("alert")).toBe(alert);
    });

    it("sequence が同じ間は、描画し直しても文言を消さない", () => {
      const props = createProps({ notices: { status: "変更しました。", alert: "", sequence: 1 } });
      const { rerender } = render(<MapLibraryDialog {...props} />);
      flushFrame();
      const status = screen.getByRole("status");
      expect(status).toHaveTextContent("変更しました。");

      rerender(<MapLibraryDialog {...props} notices={{ ...props.notices }} />);

      expect(status).toHaveTextContent("変更しました。");
    });
  });

  it("行のフォーカス先を受け取ると、その行のボタンへフォーカスして onFocusTargetApplied を1回呼ぶ", async () => {
    const props = createProps();
    const { rerender } = render(<MapLibraryDialog {...props} />);

    rerender(
      <MapLibraryDialog
        {...props}
        focusTarget={{ kind: "row", mapId: "b", action: "rename" }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "名前を変更: B" })).toHaveFocus(),
    );
    expect(props.onFocusTargetApplied).toHaveBeenCalledTimes(1);
  });

  it("一覧の既定のフォーカス先は、開いているマップの「開く」ボタン", async () => {
    const props = createProps({
      currentMapId: "b",
      focusTarget: { kind: "screenDefault" },
    });
    render(<MapLibraryDialog {...props} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^B/ })).toHaveFocus(),
    );
    expect(props.onFocusTargetApplied).toHaveBeenCalledTimes(1);
  });

  it("listCreateButton のフォーカス先は、一覧の「新しいマップ」ボタン", async () => {
    render(
      <MapLibraryDialog
        {...createProps({ focusTarget: { kind: "listCreateButton" } })}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "新しいマップ" })).toHaveFocus(),
    );
  });

  it("削除の確認の既定のフォーカス先は「キャンセル」ボタン", async () => {
    render(
      <MapLibraryDialog
        {...createProps({
          screen: { kind: "delete", mapId: "b" },
          focusTarget: { kind: "screenDefault" },
        })}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "キャンセル" })).toHaveFocus(),
    );
  });

  it("削除の確認では、group の aria-describedby が本文を指す", () => {
    render(
      <MapLibraryDialog
        {...createProps({ screen: { kind: "delete", mapId: "b" } })}
      />,
    );

    const group = screen.getByRole("group", { name: "マップを削除" });
    const descriptionId = group.getAttribute("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId as string)).toHaveTextContent(
      /^マップ「B」を削除します。削除したマップは元に戻せません。$/,
    );
  });

  it("説明は group にだけ付け、ダイアログの要素には aria-describedby を付けない", () => {
    const props = createProps();
    const { rerender } = render(<MapLibraryDialog {...props} />);
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby");

    rerender(
      <MapLibraryDialog {...props} screen={{ kind: "delete", mapId: "b" }} />,
    );
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby");
  });

  it("新規作成の既定のフォーカス先は、空の入力欄", async () => {
    const props = createProps({
      screen: { kind: "create", origin: "list" },
      focusTarget: { kind: "screenDefault" },
    });
    render(<MapLibraryDialog {...props} />);

    const input = screen.getByRole("textbox", { name: "マップ名" });
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue("");
    expect(props.onFocusTargetApplied).toHaveBeenCalledTimes(1);
  });

  it("名前変更の既定のフォーカス先は、今の名前が全選択された入力欄", async () => {
    render(
      <MapLibraryDialog
        {...createProps({
          screen: { kind: "rename", mapId: "b" },
          focusTarget: { kind: "screenDefault" },
        })}
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "マップ名",
    }) as HTMLInputElement;
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue("B");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(1);
  });

  it("新規作成の送信で、入力のまま onSubmitCreate を呼ぶ", async () => {
    const user = userEvent.setup();
    const props = createProps({ screen: { kind: "create", origin: "header" } });
    render(<MapLibraryDialog {...props} />);

    await user.type(screen.getByRole("textbox", { name: "マップ名" }), " 読書メモ");
    await user.click(screen.getByRole("button", { name: "作成" }));

    expect(props.onSubmitCreate).toHaveBeenCalledTimes(1);
    expect(props.onSubmitCreate).toHaveBeenCalledWith(" 読書メモ");
  });

  it("名前変更の送信で、対象の id と入力で onSubmitRename を呼ぶ", async () => {
    const user = userEvent.setup();
    const props = createProps({ screen: { kind: "rename", mapId: "b" } });
    render(<MapLibraryDialog {...props} />);

    const input = screen.getByRole("textbox", { name: "マップ名" });
    await user.clear(input);
    await user.type(input, "読書メモ{Enter}");

    expect(props.onSubmitRename).toHaveBeenCalledTimes(1);
    expect(props.onSubmitRename).toHaveBeenCalledWith("b", "読書メモ");
  });

  // 閉じた直後のダブルクリックの続きをキャンバスが無視するための通知。キーボードのクリック（detail 0）は数えない
  it("ダイアログの中のマウスのクリックでは onMouseClick を呼び、キーボードのクリック（detail 0）では呼ばない", () => {
    const props = createProps();
    render(<MapLibraryDialog {...props} />);
    const close = screen.getByRole("button", { name: "閉じる" });

    fireEvent.click(close, { detail: 0 });
    expect(props.onMouseClick).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(close, { detail: 1 });
    expect(props.onMouseClick).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("削除の確認の「このマップを削除」で、対象の id で onConfirmDelete を呼ぶ", async () => {
    const user = userEvent.setup();
    const props = createProps({ screen: { kind: "delete", mapId: "b" } });
    render(<MapLibraryDialog {...props} />);

    await user.click(screen.getByRole("button", { name: "このマップを削除" }));

    expect(props.onConfirmDelete).toHaveBeenCalledTimes(1);
    expect(props.onConfirmDelete).toHaveBeenCalledWith("b");
  });

  describe("削除の確認の文言", () => {
    // 配列の順と表示順を変えて、次に開くマップが表示順で決まることを確かめる
    const threeMaps: MapIndexEntry[] = [
      {
        id: "a",
        name: "A",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-21T10:00:00.000Z",
      },
      {
        id: "c",
        name: "C",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-21T11:00:00.000Z",
      },
      {
        id: "b",
        name: "B",
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-21T12:00:00.000Z",
      },
    ];

    function descriptionText() {
      const id = screen.getByRole("group").getAttribute("aria-describedby");
      return document.getElementById(id as string)?.textContent;
    }

    it("開いているマップ A を削除すると、更新日時の最も新しい B を開くと表示する", () => {
      render(
        <MapLibraryDialog
          {...createProps({
            screen: { kind: "delete", mapId: "a" },
            maps: threeMaps,
            currentMapId: "a",
          })}
        />,
      );

      expect(descriptionText()).toBe(
        "マップ「A」を削除します。削除したマップは元に戻せません。開いているマップです。削除すると「B」を開きます。",
      );
    });

    it("開いていないマップ B の削除では、次に開くマップの文言を出さない", () => {
      render(
        <MapLibraryDialog
          {...createProps({
            screen: { kind: "delete", mapId: "b" },
            maps: threeMaps,
            currentMapId: "a",
          })}
        />,
      );

      expect(descriptionText()).toBe(
        "マップ「B」を削除します。削除したマップは元に戻せません。",
      );
    });

    it("1件だけのときは、最後のマップの文言を出す", () => {
      render(
        <MapLibraryDialog
          {...createProps({
            screen: { kind: "delete", mapId: "a" },
            maps: [threeMaps[0]],
            currentMapId: "a",
          })}
        />,
      );

      expect(descriptionText()).toBe(
        "マップ「A」を削除します。削除したマップは元に戻せません。最後のマップのため、削除すると空の「無題のマップ」を作成します。",
      );
    });
  });

  it("削除の対象がもう無いときは、削除の確認を描画せず onCancel を1回呼ぶ", () => {
    const props = createProps({ screen: { kind: "delete", mapId: "missing" } });
    render(<MapLibraryDialog {...props} />);

    expect(
      screen.queryByRole("button", { name: "このマップを削除" }),
    ).not.toBeInTheDocument();
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirmDelete).not.toHaveBeenCalled();
  });

  it("削除の対象が無いまま onCancel が差し替わっても、onCancel を再び呼ばない", () => {
    const props = createProps({ screen: { kind: "delete", mapId: "missing" } });
    const { rerender } = render(<MapLibraryDialog {...props} />);
    const nextOnCancel = jest.fn();

    rerender(<MapLibraryDialog {...props} onCancel={nextOnCancel} />);

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(nextOnCancel).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "delete", mapId: "missing" } as const,
    { kind: "rename", mapId: "missing" } as const,
  ])("%o の対象が無いときは、フォーカス先を使い切らない", (screenState) => {
    const props = createProps({
      screen: screenState,
      focusTarget: { kind: "screenDefault" },
    });
    render(<MapLibraryDialog {...props} />);

    expect(props.onFocusTargetApplied).not.toHaveBeenCalled();
  });

  it("名前変更の対象がもう無いときは、名前の画面を描画せず onCancel を1回呼ぶ", () => {
    const props = createProps({ screen: { kind: "rename", mapId: "missing" } });
    render(<MapLibraryDialog {...props} />);

    expect(screen.queryByRole("textbox", { name: "マップ名" })).not.toBeInTheDocument();
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onSubmitRename).not.toHaveBeenCalled();
  });

  it("Escape で onEscape を呼び、オーバーレイの pointerdown では閉じない", () => {
    const props = createProps();
    render(<MapLibraryDialog {...props} />);

    const overlay = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.pointerDown(overlay);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onEscape).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onEscape).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["ダイアログ自身", (dialog: HTMLElement) => dialog],
    ["ダイアログの中の見出し", (dialog: HTMLElement) => within(dialog).getByRole("heading")],
  ])("%sの余白を押すと、フォーカスは body に落ちずダイアログ自身に移る", async (_label, pickTarget) => {
    const user = userEvent.setup();
    render(<MapLibraryDialog {...createProps()} />);
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "閉じる" }));

    await user.click(pickTarget(dialog));

    expect(dialog).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(dialog);
  });

  it("ダイアログ自身にフォーカスがあるとき、Tab は先頭へ、Shift+Tab は末尾へ移る", async () => {
    const user = userEvent.setup();
    render(<MapLibraryDialog {...createProps()} />);
    const dialog = screen.getByRole("dialog");
    const buttons = within(dialog).getAllByRole("button");

    dialog.focus();
    expect(document.activeElement).toBe(dialog);
    await user.keyboard("{Tab}");
    expect(buttons[0]).toHaveFocus();

    dialog.focus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(buttons[buttons.length - 1]).toHaveFocus();
  });

  it("一覧の各ボタンを対応するコールバックへつなぐ", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<MapLibraryDialog {...props} />);

    await user.click(screen.getByRole("button", { name: /^B/ }));
    await user.click(screen.getByRole("button", { name: "削除: B" }));
    await user.click(screen.getByRole("button", { name: "名前を変更: A" }));
    await user.click(screen.getByRole("button", { name: "新しいマップ" }));
    await user.click(screen.getByRole("button", { name: "閉じる" }));

    expect(props.onSwitch).toHaveBeenCalledWith("b");
    expect(props.onOpenDelete).toHaveBeenCalledWith("b");
    expect(props.onOpenRename).toHaveBeenCalledWith("a");
    expect(props.onOpenCreate).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
