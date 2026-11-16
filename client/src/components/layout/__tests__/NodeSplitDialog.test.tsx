import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { NodeSplitDialog } from "@/components/layout/NodeSplitDialog";

type Props = ComponentProps<typeof NodeSplitDialog>;

function renderDialog(overrides: Partial<Props> = {}) {
  const props: Props = {
    targetLabel: "りんご、みかん、ぶどう",
    separatorPreset: "ja-comma",
    customSeparator: "",
    fragments: [],
    statusText: "区切り文字で 2 つ以上に分けられません。",
    error: { sequence: 0, message: null },
    canSubmit: false,
    focusRequest: null,
    onFocusRequestApplied: jest.fn(),
    onSeparatorPresetChange: jest.fn(),
    onCustomSeparatorChange: jest.fn(),
    onCancel: jest.fn(),
    onSubmit: jest.fn(),
    onMouseClick: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<NodeSplitDialog {...props} />) };
}

describe("NodeSplitDialog", () => {
  it("名前付きのモーダルダイアログとして、区切り文字の入力を可視のラベルつきで出す", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "ノードを分割" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(/最初の断片は元のノードに残り/);
    expect(within(dialog).getByLabelText("区切り文字")).toHaveValue("ja-comma");
  });

  it("ダイアログ全体が縦にスクロールでき、画面が低くても確定ボタンへ届く（L-409）", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveClass("max-h-full", "overflow-y-auto");
  });

  it("focusRequest が separator なら区切り文字のプルダウンへフォーカスし、要求の消費を通知する", () => {
    const { props } = renderDialog({ focusRequest: "separator" });

    expect(screen.getByLabelText("区切り文字")).toHaveFocus();
    expect(props.onFocusRequestApplied).toHaveBeenCalledTimes(1);
  });

  it("分割するノードのラベルを出し、空のラベルは「（空）」にする", () => {
    const { rerender, props } = renderDialog();
    expect(screen.getByText("りんご、みかん、ぶどう")).toBeInTheDocument();

    rerender(<NodeSplitDialog {...props} targetLabel="" />);
    expect(screen.getByText("（空）")).toBeInTheDocument();
  });

  it("プルダウンの選択と「その他」の入力を通知する", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog();

    await user.selectOptions(screen.getByLabelText("区切り文字"), "slash");
    expect(props.onSeparatorPresetChange).toHaveBeenCalledWith("slash");

    rerender(<NodeSplitDialog {...props} separatorPreset="custom" />);
    fireEvent.change(screen.getByLabelText("その他の区切り文字"), { target: { value: "->" } });
    expect(props.onCustomSeparatorChange).toHaveBeenCalledWith("->");
  });

  it("状態文言を常設のライブリージョンに出し、中身だけを替える", () => {
    const { rerender, props } = renderDialog({ statusText: "区切り文字を入力してください。" });
    const region = screen.getByText("区切り文字を入力してください。");
    expect(region).toHaveAttribute("aria-live", "polite");

    rerender(<NodeSplitDialog {...props} statusText="3件に分割します（2件を追加）" />);
    expect(screen.getByText("3件に分割します（2件を追加）")).toBe(region);
  });

  describe("断片の一覧", () => {
    it("番号付きの一覧に、1 件目は「元のノードに残る」、2 件目以降は「新しい兄弟として追加」と注記する", () => {
      renderDialog({ fragments: ["りんご", "みかん", "ぶどう"] });

      const list = screen.getByRole("list", { name: "分割後の断片" });
      expect(list.tagName).toBe("OL");
      const items = within(list).getAllByRole("listitem");
      expect(items).toHaveLength(3);
      expect(items[0]).toHaveTextContent("りんご元のノードに残る");
      expect(items[1]).toHaveTextContent("みかん新しい兄弟として追加");
      expect(items[2]).toHaveTextContent("ぶどう新しい兄弟として追加");
    });

    it("分割できないとき（断片が無い）は一覧を出さない", () => {
      renderDialog({ fragments: [] });

      expect(screen.queryByRole("list")).toBeNull();
    });

    it("断片の前後の空白を畳まず、折り返して全文を出す（L-821）。一覧は低い画面でも潰れない（L-409）", () => {
      renderDialog({ fragments: ["a  b", "c"] });

      const list = screen.getByRole("list", { name: "分割後の断片" });
      expect(list).toHaveClass("max-h-60", "shrink-0", "overflow-y-auto");
      const text = within(list).getAllByRole("listitem")[0].firstElementChild!;
      expect(text.textContent).toBe("a  b");
      expect(text).toHaveClass("whitespace-pre-wrap", "break-words");
    });
  });

  describe("確定とキャンセル", () => {
    it("確定ボタン「分割する」は canSubmit が偽なら無効で、真なら押して onSubmit を呼ぶ", async () => {
      const user = userEvent.setup();
      const { props, rerender } = renderDialog({ canSubmit: false });
      expect(screen.getByRole("button", { name: "分割する" })).toBeDisabled();

      rerender(<NodeSplitDialog {...props} canSubmit />);
      await user.click(screen.getByRole("button", { name: "分割する" }));
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it("キャンセルボタンで onCancel を呼ぶ", async () => {
      const user = userEvent.setup();
      const { props } = renderDialog();

      await user.click(screen.getByRole("button", { name: "キャンセル" }));

      expect(props.onCancel).toHaveBeenCalledTimes(1);
    });

    it("確定・キャンセルのボタンはリピートの Enter・Space の既定動作を止める", () => {
      renderDialog({ canSubmit: true });

      for (const name of ["分割する", "キャンセル"]) {
        const button = screen.getByRole("button", { name });
        expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
        expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
      }
    });

    it("ダブルクリックの 2 回目のクリックは握りつぶし、マウスのクリックを親へ通知する", () => {
      const { props } = renderDialog({ canSubmit: true });
      const button = screen.getByRole("button", { name: "分割する" });

      fireEvent.click(button, { detail: 1 });
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
      expect(props.onMouseClick).toHaveBeenCalledTimes(1);

      fireEvent.click(button, { detail: 2 });
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it("キーボード・支援技術のクリック（detail 0）では確定でき、マウスのクリックとしては通知しない", () => {
      const { props } = renderDialog({ canSubmit: true });

      fireEvent.click(screen.getByRole("button", { name: "分割する" }), { detail: 0 });

      expect(props.onSubmit).toHaveBeenCalledTimes(1);
      expect(props.onMouseClick).not.toHaveBeenCalled();
    });
  });

  describe("キー操作", () => {
    it("プルダウンで Escape を押すと onCancel を呼ぶ", () => {
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Escape" });

      expect(props.onCancel).toHaveBeenCalledTimes(1);
    });

    it("IME 変換中（isComposing）の Escape では閉じない", () => {
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Escape", isComposing: true });

      expect(props.onCancel).not.toHaveBeenCalled();
    });

    it("IME 変換中（keyCode が 229）の Escape では閉じない", () => {
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Escape", keyCode: 229 });

      expect(props.onCancel).not.toHaveBeenCalled();
    });

    it("プルダウンの Enter では確定しない", () => {
      const { props } = renderDialog({ canSubmit: true });

      fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Enter" });

      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it("「その他」の入力欄の Enter は、確定できるときだけ onSubmit を呼ぶ", () => {
      const { props, rerender } = renderDialog({ separatorPreset: "custom", canSubmit: false });
      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter" });
      expect(props.onSubmit).not.toHaveBeenCalled();

      rerender(<NodeSplitDialog {...props} canSubmit />);
      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter" });
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["isComposing が真", { isComposing: true }],
      ["keyCode が 229", { keyCode: 229 }],
      ["リピート", { repeat: true }],
    ])("「その他」の入力欄の Enter は %s のとき確定しない", (_name, init) => {
      const { props } = renderDialog({ separatorPreset: "custom", canSubmit: true });

      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter", ...init });

      expect(props.onSubmit).not.toHaveBeenCalled();
    });
  });

  it("エラーを role=alert に出す（再読み上げのため次のフレームで入る）", async () => {
    renderDialog({ error: { sequence: 1, message: "ノードを分割できませんでした。" } });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ノードを分割できませんでした。"));
  });

  it("エラーが無いときも role=alert の領域を常に描画する", () => {
    renderDialog();

    expect(screen.getByRole("alert")).toHaveTextContent("");
  });
});
