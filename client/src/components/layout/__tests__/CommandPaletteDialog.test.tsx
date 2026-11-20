import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { CommandPaletteDialog } from "@/components/layout/CommandPaletteDialog";
import type { FilteredCommand } from "@/domain/commands/commandTypes";

function makeItem(options: {
  id: string;
  label: string;
  categoryId?: FilteredCommand["definition"]["categoryId"];
  categoryLabel?: string;
  enabled?: boolean;
  disabledReason?: string | null;
}): FilteredCommand {
  const enabled = options.enabled ?? true;
  return {
    definition: {
      id: options.id,
      categoryId: options.categoryId ?? "edit",
      categoryLabel: options.categoryLabel ?? "編集",
      label: options.label,
      aliases: [],
      opensDialog: false,
      requiredInV1: true,
    },
    availability: {
      enabled,
      modeMismatch: false,
      disabledReason: enabled ? null : (options.disabledReason ?? "不可"),
    },
    displayLabel: options.label,
  };
}

type Props = ComponentProps<typeof CommandPaletteDialog>;

function renderDialog(overrides: Partial<Props> = {}) {
  const props: Props = {
    open: true,
    query: "",
    items: [
      makeItem({ id: "edit.undo", label: "元に戻す" }),
      makeItem({
        id: "edit.redo",
        label: "やり直す",
        enabled: false,
        disabledReason: "やり直す履歴がありません",
      }),
      makeItem({
        id: "view.outline",
        label: "アウトライン表示へ切替",
        categoryId: "view",
        categoryLabel: "表示",
      }),
    ],
    overflowCount: 0,
    activeIndex: 0,
    rejectMessage: null,
    rejectSequence: 0,
    onQueryChange: jest.fn(),
    onMoveHighlight: jest.fn(),
    onExecuteActive: jest.fn(),
    onDismiss: jest.fn(),
    onMouseClick: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<CommandPaletteDialog {...props} />) };
}

describe("CommandPaletteDialog", () => {
  it("open=false のときは描画しない", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("role=dialog / aria-modal / タイトル「コマンドパレット」と閉じるボタンを持つ", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "コマンドパレット" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("button", { name: "閉じる" })).toBeInTheDocument();
  });

  it("開いた直後は検索欄にフォーカスし、aria-controls で listbox に結ぶ", () => {
    renderDialog();

    const input = screen.getByRole("combobox", { name: "コマンドを検索" });
    expect(input).toHaveFocus();

    const listbox = screen.getByRole("listbox", { name: "コマンド候補" });
    expect(input).toHaveAttribute("aria-controls", listbox.id);

    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
  });

  it("不可候補は aria-disabled と理由を持つ", () => {
    renderDialog();
    const redo = screen.getByRole("option", { name: /やり直す/ });
    expect(redo).toHaveAttribute("aria-disabled", "true");
    expect(redo).toHaveTextContent("やり直す履歴がありません");
  });

  it("閉じるボタンで onDismiss を呼ぶ", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("Escape で onDismiss を呼ぶ", () => {
    const { props } = renderDialog();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("↑↓ Home/End で onMoveHighlight を呼び、端でも親に委譲する", () => {
    const { props } = renderDialog({ activeIndex: 1 });
    const input = screen.getByRole("combobox", { name: "コマンドを検索" });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(props.onMoveHighlight).toHaveBeenCalledWith("down");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(props.onMoveHighlight).toHaveBeenCalledWith("up");

    fireEvent.keyDown(input, { key: "Home" });
    expect(props.onMoveHighlight).toHaveBeenCalledWith("home");

    fireEvent.keyDown(input, { key: "End" });
    expect(props.onMoveHighlight).toHaveBeenCalledWith("end");
  });

  it("Enter で onExecuteActive を呼ぶ（可否判定は親）", () => {
    const { props } = renderDialog();
    const input = screen.getByRole("combobox", { name: "コマンドを検索" });

    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onExecuteActive).toHaveBeenCalledTimes(1);
  });

  it("拒否メッセージを role=status の live に出し、sequence で再読み上げできる", async () => {
    const { props, rerender } = renderDialog({
      rejectMessage: "選択がありません",
      rejectSequence: 1,
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("選択がありません");
    });

    rerender(
      <CommandPaletteDialog
        {...props}
        rejectMessage="選択がありません"
        rejectSequence={2}
      />,
    );
    // useReannouncedNotice は一旦空にしてから戻すため、sequence 変化を受け付ける
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("選択がありません");
    });
  });

  it("overflowCount > 0 のとき「他 N 件」を status に出し、0 では出さない", () => {
    const { props, rerender } = renderDialog({ overflowCount: 3 });
    expect(screen.getByRole("status")).toHaveTextContent("他 3 件");

    rerender(<CommandPaletteDialog {...props} overflowCount={0} rejectMessage={null} />);
    expect(screen.queryByText(/他 \d+ 件/)).toBeNull();
  });

  it("検索入力で onQueryChange を呼ぶ", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByRole("combobox", { name: "コマンドを検索" }), "u");
    expect(props.onQueryChange).toHaveBeenCalled();
  });

  it("オーバーレイの pointerdown では閉じず、マウスの click（detail 1）で onDismiss と onMouseClick を呼ぶ", () => {
    const { props } = renderDialog();
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement;

    const notCanceled = fireEvent.pointerDown(overlay);
    expect(notCanceled).toBe(false);
    expect(props.onDismiss).not.toHaveBeenCalled();

    fireEvent.click(overlay, { detail: 0 });
    expect(props.onMouseClick).not.toHaveBeenCalled();
    expect(props.onDismiss).not.toHaveBeenCalled();

    fireEvent.click(overlay, { detail: 1 });
    expect(props.onMouseClick).toHaveBeenCalledTimes(1);
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("ダイアログ内のマウスクリックで onMouseClick を更新する（L-408）", () => {
    const { props } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }), { detail: 1 });
    expect(props.onMouseClick).toHaveBeenCalled();
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("IME 変換中・repeat の Enter / Escape は処理しない", () => {
    const { props } = renderDialog();
    const input = screen.getByRole("combobox", { name: "コマンドを検索" });

    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    fireEvent.keyDown(input, { key: "Enter", repeat: true });
    fireEvent.keyDown(window, { key: "Escape", repeat: true });

    expect(props.onExecuteActive).not.toHaveBeenCalled();
    expect(props.onDismiss).not.toHaveBeenCalled();
  });
});
