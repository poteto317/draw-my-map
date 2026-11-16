import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { LabelReplaceDialog } from "@/components/layout/LabelReplaceDialog";
import type { LabelReplaceRow } from "@/domain/search/nodeLabelReplace";

type Props = ComponentProps<typeof LabelReplaceDialog>;

function row(nodeId: number, before: string, after: string, status: LabelReplaceRow["status"] = "replace"): LabelReplaceRow {
  return { nodeId, before, after, matchCount: 1, status };
}

function renderDialog(overrides: Partial<Props> = {}) {
  const props: Props = {
    query: "",
    replacement: "",
    scopeSelectedOnly: false,
    scopeCount: 0,
    previewRows: [],
    hiddenReplaceCount: 0,
    previewLimit: 200,
    statusText: "検索語を入力してください。",
    submitLabel: "0件を置換",
    error: { sequence: 0, message: null },
    canSubmit: false,
    focusRequest: null,
    onFocusRequestApplied: jest.fn(),
    onQueryChange: jest.fn(),
    onReplacementChange: jest.fn(),
    onScopeSelectedOnlyChange: jest.fn(),
    onCancel: jest.fn(),
    onSubmit: jest.fn(),
    onMouseClick: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<LabelReplaceDialog {...props} />) };
}

describe("LabelReplaceDialog", () => {
  it("名前付きのモーダルダイアログとして、検索語・置換語の入力欄を可視のラベルつきで出す", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "一括置換" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByLabelText("検索語")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("置換語")).toBeInTheDocument();
  });

  it("focusRequest が query なら検索語へフォーカスし、要求の消費を通知する", () => {
    const { props } = renderDialog({ focusRequest: "query" });

    expect(screen.getByLabelText("検索語")).toHaveFocus();
    expect(props.onFocusRequestApplied).toHaveBeenCalledTimes(1);
  });

  it("入力の変更を通知する", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByLabelText("検索語"), "a");
    await user.type(screen.getByLabelText("置換語"), "b");

    expect(props.onQueryChange).toHaveBeenCalledWith("a");
    expect(props.onReplacementChange).toHaveBeenCalledWith("b");
  });

  it("状態文言を常設のライブリージョンに出す", () => {
    const { rerender, props } = renderDialog({ statusText: "検索語を入力してください。" });
    const region = screen.getByText("検索語を入力してください。");
    expect(region).toHaveAttribute("aria-live", "polite");

    rerender(<LabelReplaceDialog {...props} statusText="2件を置換します。" />);
    expect(screen.getByText("2件を置換します。")).toBe(region);
  });

  it("置換語が空のときだけ「一致した文字を削除します。」を出す", () => {
    const { rerender, props } = renderDialog({ replacement: "" });
    expect(screen.getByText("一致した文字を削除します。")).toBeInTheDocument();

    rerender(<LabelReplaceDialog {...props} replacement="x" />);
    expect(screen.queryByText("一致した文字を削除します。")).toBeNull();
  });

  it("範囲のチェックボックスは件数をラベルに含み、選択が 0 件なら無効", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog({ scopeCount: 0 });
    expect(screen.getByRole("checkbox", { name: "選択中のノードだけを対象にする（0件）" })).toBeDisabled();

    rerender(<LabelReplaceDialog {...props} scopeCount={3} scopeSelectedOnly />);
    const checkbox = screen.getByRole("checkbox", { name: "選択中のノードだけを対象にする（3件）" });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(props.onScopeSelectedOnlyChange).toHaveBeenCalledWith(false);
  });

  it("プレビューに置換前後を出し、空になる行には警告を出す", () => {
    renderDialog({
      previewRows: [row(1, "Apple", "Orange"), row(2, "旧", "", "emptied")],
    });

    const list = screen.getByRole("list", { name: "置換のプレビュー" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Apple");
    expect(items[0]).toHaveTextContent("Orange");
    expect(items[1]).toHaveTextContent("旧");
    expect(items[1]).toHaveTextContent("（空）");
    expect(items[1]).toHaveTextContent("置換後のラベルが空になるため置換しません。");
  });

  it("長いラベルの行は切り詰めず、折り返して全文を出す", () => {
    const longBefore = `${"長いラベル".repeat(20)}旧語`;
    const longAfter = `${"長いラベル".repeat(20)}新語`;
    renderDialog({ previewRows: [row(1, longBefore, longAfter)] });

    for (const text of [longBefore, longAfter]) {
      const span = screen.getByText(text);
      expect(span).not.toHaveClass("truncate");
      expect(span).toHaveClass("break-words");
    }
  });

  it("上限を超えた replace 行があれば件数と注記を出す", () => {
    renderDialog({ hiddenReplaceCount: 5, previewLimit: 200 });

    expect(screen.getByText("ほかに5件（一覧は先頭の200件まで表示します。確定はすべてが対象です）")).toBeInTheDocument();
  });

  it("確定ボタンは submitLabel を出し、canSubmit が偽なら無効で、押すと onSubmit を呼ぶ", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog({ submitLabel: "0件を置換", canSubmit: false });
    expect(screen.getByRole("button", { name: "0件を置換" })).toBeDisabled();

    rerender(<LabelReplaceDialog {...props} submitLabel="3件を置換" canSubmit />);
    await user.click(screen.getByRole("button", { name: "3件を置換" }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("キャンセルボタンで onCancel を呼ぶ", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it.each(["検索語", "置換語"])("%sの欄で Escape を押すと onCancel を呼ぶ", (label) => {
    const { props } = renderDialog();

    fireEvent.keyDown(screen.getByLabelText(label), { key: "Escape" });

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  describe.each(["検索語", "置換語"])("%sの欄の IME 変換中の Escape", (label) => {
    it("isComposing が真のときは閉じない", () => {
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText(label), { key: "Escape", isComposing: true });

      expect(props.onCancel).not.toHaveBeenCalled();
    });

    it("keyCode が 229 のときは閉じない", () => {
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText(label), { key: "Escape", keyCode: 229 });

      expect(props.onCancel).not.toHaveBeenCalled();
    });
  });

  describe("検索語欄の Enter", () => {
    it("置換語欄へフォーカスを移すだけで、確定しない", () => {
      const { props } = renderDialog({ canSubmit: true });

      fireEvent.keyDown(screen.getByLabelText("検索語"), { key: "Enter" });

      expect(screen.getByLabelText("置換語")).toHaveFocus();
      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it.each([
      ["isComposing が真", { isComposing: true }],
      ["keyCode が 229", { keyCode: 229 }],
    ])("IME 変換中（%s）は何もしない", (_name, init) => {
      const { props } = renderDialog({ canSubmit: true });
      screen.getByLabelText("検索語").focus();

      fireEvent.keyDown(screen.getByLabelText("検索語"), { key: "Enter", ...init });

      expect(screen.getByLabelText("検索語")).toHaveFocus();
      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it("リピートの Enter ではフォーカスを移さない", () => {
      renderDialog();
      screen.getByLabelText("検索語").focus();

      fireEvent.keyDown(screen.getByLabelText("検索語"), { key: "Enter", repeat: true });

      expect(screen.getByLabelText("検索語")).toHaveFocus();
    });
  });

  describe("置換語欄の Enter", () => {
    it("確定できるときだけ onSubmit を呼ぶ", () => {
      const { props, rerender } = renderDialog({ canSubmit: false });
      fireEvent.keyDown(screen.getByLabelText("置換語"), { key: "Enter" });
      expect(props.onSubmit).not.toHaveBeenCalled();

      rerender(<LabelReplaceDialog {...props} canSubmit />);
      fireEvent.keyDown(screen.getByLabelText("置換語"), { key: "Enter" });
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["isComposing が真", { isComposing: true }],
      ["keyCode が 229", { keyCode: 229 }],
      ["リピート", { repeat: true }],
    ])("%sのときは確定しない", (_name, init) => {
      const { props } = renderDialog({ canSubmit: true });

      fireEvent.keyDown(screen.getByLabelText("置換語"), { key: "Enter", ...init });

      expect(props.onSubmit).not.toHaveBeenCalled();
    });
  });

  it("確定・キャンセルのボタンはリピートの Enter・Space の既定動作を止める", () => {
    renderDialog({ canSubmit: true, submitLabel: "1件を置換" });

    for (const name of ["1件を置換", "キャンセル"]) {
      const button = screen.getByRole("button", { name });
      expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
      expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
    }
  });

  it("ダブルクリックの 2 回目のクリックは握りつぶし、マウスのクリックを親へ通知する", () => {
    const { props } = renderDialog({ canSubmit: true, submitLabel: "1件を置換" });
    const button = screen.getByRole("button", { name: "1件を置換" });

    fireEvent.click(button, { detail: 1 });
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onMouseClick).toHaveBeenCalledTimes(1);

    fireEvent.click(button, { detail: 2 });
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("キーボード・支援技術のクリック（detail 0）では確定でき、マウスのクリックとしては通知しない", () => {
    const { props } = renderDialog({ canSubmit: true, submitLabel: "1件を置換" });

    fireEvent.click(screen.getByRole("button", { name: "1件を置換" }), { detail: 0 });

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onMouseClick).not.toHaveBeenCalled();
  });

  it("エラーを role=alert に出す（再読み上げのため次のフレームで入る）", async () => {
    renderDialog({ error: { sequence: 1, message: "ラベルを置換できませんでした。もう一度お試しください。" } });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ラベルを置換できませんでした。もう一度お試しください。"));
  });
});
