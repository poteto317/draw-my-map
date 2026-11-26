import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { NodeMergeDialog } from "@/components/layout/NodeMergeDialog";
import type { NodeMergePreview } from "@/hooks/nodeMergePreview";

type Props = ComponentProps<typeof NodeMergeDialog>;

function preview(overrides: Partial<NodeMergePreview> = {}): NodeMergePreview {
  return {
    survivorLabel: "リンゴ",
    label: "りんご リンゴ",
    importanceLabel: "高",
    illustrationText: "イラストなし",
    movedChildCount: 0,
    discardedIllustrationCount: 0,
    absorbedLabels: ["りんご"],
    hiddenAbsorbedCount: 0,
    noteText: null,
    linkText: null,
    tagText: null,
    sourceText: null,
    mapLinkText: null,
    ...overrides,
  };
}

function renderDialog(overrides: Partial<Props> = {}) {
  const props: Props = {
    preview: preview(),
    separatorPreset: "space",
    customSeparator: "",
    statusText: "2件を1件に統合します",
    error: { sequence: 0, message: null },
    canSubmit: true,
    focusRequest: null,
    onFocusRequestApplied: jest.fn(),
    onSeparatorPresetChange: jest.fn(),
    onCustomSeparatorChange: jest.fn(),
    onCancel: jest.fn(),
    onSubmit: jest.fn(),
    onMouseClick: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<NodeMergeDialog {...props} />) };
}

describe("NodeMergeDialog", () => {
  it("名前付きのモーダルダイアログとして、区切り文字の入力を可視のラベルつきで出す", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "ノードを統合" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(/残すノード（最後に選んだノード＝主選択）へ 1 つにまとめます/);
    expect(within(dialog).getByLabelText("区切り文字")).toHaveValue("space");
    expect(dialog).toHaveClass("max-h-full", "overflow-y-auto");
  });

  it("focusRequest が separator なら区切り文字のプルダウンへフォーカスし、要求の消費を通知する", () => {
    const { props } = renderDialog({ focusRequest: "separator" });

    expect(screen.getByLabelText("区切り文字")).toHaveFocus();
    expect(props.onFocusRequestApplied).toHaveBeenCalledTimes(1);
  });

  it("プルダウンの選択と「その他」の入力を通知する", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog();

    await user.selectOptions(screen.getByLabelText("区切り文字"), "ja-comma");
    expect(props.onSeparatorPresetChange).toHaveBeenCalledWith("ja-comma");

    rerender(<NodeMergeDialog {...props} separatorPreset="custom" />);
    fireEvent.change(screen.getByLabelText("その他の区切り文字"), { target: { value: " | " } });
    expect(props.onCustomSeparatorChange).toHaveBeenCalledWith(" | ");
  });

  it("状態文言を常設のライブリージョンに出し、中身だけを替える", () => {
    const { rerender, props } = renderDialog({ statusText: "2件を1件に統合します" });
    const region = screen.getByText("2件を1件に統合します");
    expect(region).toHaveAttribute("aria-live", "polite");

    rerender(<NodeMergeDialog {...props} statusText="同じ親の兄弟のノードだけを統合できます。" preview={null} />);
    expect(screen.getByText("同じ親の兄弟のノードだけを統合できます。")).toBe(region);
  });

  describe("プレビュー", () => {
    it("統合後のラベル・重要度・イラストの扱い・付け替える子の件数を出す", () => {
      renderDialog({
        preview: preview({ label: "りんご リンゴ", importanceLabel: "高", illustrationText: "主選択のイラストを残す", movedChildCount: 2 }),
      });

      expect(screen.getByText("統合後のラベル").nextElementSibling).toHaveTextContent("りんご リンゴ");
      expect(screen.getByText("重要度").nextElementSibling).toHaveTextContent("高");
      expect(screen.getByText("イラスト").nextElementSibling).toHaveTextContent("主選択のイラストを残す");
      expect(screen.getByText("付け替える子").nextElementSibling).toHaveTextContent("2件");
    });

    it("メモを連結するときは「メモ」の行に件数と文字数を出す。見出しは縮まず、値は高さに上限がある", () => {
      renderDialog({ preview: preview({ noteText: "2 件のメモを連結（8 文字）" }) });

      const term = screen.getByText("メモ");
      expect(term.tagName).toBe("DT");
      expect(term).toHaveClass("shrink-0");
      expect(term.nextElementSibling).toHaveTextContent("2 件のメモを連結（8 文字）");
      expect(term.nextElementSibling).toHaveClass("max-h-40", "overflow-y-auto");
    });

    it("メモが無いときは「メモ」の行を出さない", () => {
      renderDialog({ preview: preview({ noteText: null }) });

      expect(screen.queryByText("メモ")).toBeNull();
    });

    it("URL を連結するときは「URL」の行に件数を出す。見出しは縮まない", () => {
      renderDialog({ preview: preview({ linkText: "3 件（重複 1 件を除く）" }) });

      const term = screen.getByText("URL");
      expect(term.tagName).toBe("DT");
      expect(term).toHaveClass("shrink-0");
      expect(term.nextElementSibling).toHaveTextContent("3 件（重複 1 件を除く）");
    });

    it("URL が無いときは「URL」の行を出さない", () => {
      renderDialog({ preview: preview({ linkText: null }) });

      expect(screen.queryByText("URL")).toBeNull();
    });

    it("タグを連結するときは、URL の行の後の「タグ」の行に件数を出す。見出しは縮まない", () => {
      renderDialog({ preview: preview({ linkText: "1 件", tagText: "3 件（重複 1 件を除く）" }) });

      const term = screen.getByText("タグ");
      expect(term.tagName).toBe("DT");
      expect(term).toHaveClass("shrink-0");
      expect(term.nextElementSibling).toHaveTextContent("3 件（重複 1 件を除く）");
      expect(screen.getByText("URL").parentElement?.nextElementSibling).toBe(term.parentElement);
    });

    it("タグが無いときは「タグ」の行を出さない", () => {
      renderDialog({ preview: preview({ tagText: null }) });

      expect(screen.queryByText("タグ")).toBeNull();
    });

    it("出典を連結するときは、タグの行の後の「出典」の行に件数を出す。見出しは縮まない", () => {
      renderDialog({ preview: preview({ tagText: "1 件", sourceText: "3 件（重複 1 件を除く）" }) });

      const term = screen.getByText("出典");
      expect(term.tagName).toBe("DT");
      expect(term).toHaveClass("shrink-0");
      expect(term.nextElementSibling).toHaveTextContent("3 件（重複 1 件を除く）");
      expect(screen.getByText("タグ").parentElement?.nextElementSibling).toBe(term.parentElement);
    });

    it("出典が無いときは「出典」の行を出さない", () => {
      renderDialog({ preview: preview({ sourceText: null }) });

      expect(screen.queryByText("出典")).toBeNull();
    });

    it("マップ間リンクを連結するときは、出典の行の後の「マップ間リンク」の行に件数を出す。見出しは縮まない", () => {
      renderDialog({ preview: preview({ sourceText: "1 件", mapLinkText: "3 件（重複 1 件を除く）" }) });

      const term = screen.getByText("マップ間リンク");
      expect(term.tagName).toBe("DT");
      expect(term).toHaveClass("shrink-0");
      expect(term.nextElementSibling).toHaveTextContent("3 件（重複 1 件を除く）");
      expect(screen.getByText("出典").parentElement?.nextElementSibling).toBe(term.parentElement);
    });

    it("マップ間リンクが無いときは「マップ間リンク」の行を出さない", () => {
      renderDialog({ preview: preview({ mapLinkText: null }) });

      expect(screen.queryByText("マップ間リンク")).toBeNull();
    });

    it("残すノードのラベルを出し、空のラベルは「（空）」、空白だけなら「（空白のみ）」にする", () => {
      const { rerender, props } = renderDialog({ preview: preview({ survivorLabel: "リンゴ" }) });
      expect(screen.getByText("残すノード").nextElementSibling).toHaveTextContent("リンゴ");

      rerender(<NodeMergeDialog {...props} preview={preview({ survivorLabel: "" })} />);
      expect(screen.getByText("残すノード").nextElementSibling).toHaveTextContent("（空）");

      rerender(<NodeMergeDialog {...props} preview={preview({ survivorLabel: "  " })} />);
      expect(screen.getByText("残すノード").nextElementSibling).toHaveTextContent("（空白のみ）");
    });

    it("プレビューの見出し（dt）は、ラベルが長くても縮んで折れない（shrink-0）", () => {
      renderDialog({ preview: preview({ survivorLabel: "長い".repeat(40), label: "長い".repeat(80), illustrationText: "『" + "長い".repeat(40) + "』のイラストを引き継ぐ" }) });

      const terms = ["残すノード", "統合後のラベル", "重要度", "イラスト", "付け替える子"].map((name) => screen.getByText(name));
      for (const term of terms) {
        expect(term.tagName).toBe("DT");
        expect(term).toHaveClass("shrink-0");
      }
    });

    it("残すノード・統合後のラベル・イラストは高さに上限があり（max-h-40）、超えれば内側でスクロールする", () => {
      renderDialog({ preview: preview({ label: "長い".repeat(500) }) });

      for (const name of ["残すノード", "統合後のラベル", "イラスト"]) {
        const value = screen.getByText(name).nextElementSibling!;
        expect(value).toHaveClass("max-h-40", "overflow-y-auto", "whitespace-pre-wrap", "break-words");
      }
    });

    it("統合後のラベルは前後の空白を畳まず、折り返して全文を出す。空白だけが違う結果を見分けられる（L-821）", () => {
      const { rerender, props } = renderDialog({ preview: preview({ label: "A  B" }) });
      const label = screen.getByText("統合後のラベル").nextElementSibling!;
      expect(label.textContent).toBe("A  B");
      expect(label).toHaveClass("whitespace-pre-wrap", "break-words");

      rerender(<NodeMergeDialog {...props} preview={preview({ label: "A B" })} />);
      expect(screen.getByText("統合後のラベル").nextElementSibling!.textContent).toBe("A B");
    });

    it("統合後のラベルが空なら「（空）」、空白だけなら「（空白のみ）」と出す", () => {
      const { rerender, props } = renderDialog({ preview: preview({ label: "" }) });
      expect(screen.getByText("統合後のラベル").nextElementSibling).toHaveTextContent("（空）");

      rerender(<NodeMergeDialog {...props} preview={preview({ label: "  " })} />);
      expect(screen.getByText("統合後のラベル").nextElementSibling).toHaveTextContent("（空白のみ）");
    });

    it("失われるイラストが 1 件以上なら警告を出し、0 件のときは出さない", () => {
      const { rerender, props } = renderDialog({ preview: preview({ discardedIllustrationCount: 2 }) });
      expect(screen.getByText("2件のイラストは統合で失われます")).toBeInTheDocument();

      rerender(<NodeMergeDialog {...props} preview={preview({ discardedIllustrationCount: 0 })} />);
      expect(screen.queryByText(/イラストは統合で失われます/)).toBeNull();
    });

    it("統合されて消えるノードのラベルを一覧にし、空・空白だけのラベルは代わりの表示にする", () => {
      renderDialog({ preview: preview({ absorbedLabels: ["りんご", "", " "] }) });

      const list = screen.getByRole("list", { name: "統合されて消えるノード" });
      const items = within(list).getAllByRole("listitem");
      expect(items.map((item) => item.textContent)).toEqual(["りんご", "（空）", "（空白のみ）"]);
      expect(list).toHaveClass("max-h-60", "shrink-0", "overflow-y-auto");
    });

    it("一覧の行は前後の空白を畳まず、折り返して全文を出す", () => {
      renderDialog({ preview: preview({ absorbedLabels: ["a  b"] }) });

      const item = screen.getByRole("list", { name: "統合されて消えるノード" }).firstElementChild!;
      expect(item.firstElementChild!.textContent).toBe("a  b");
      expect(item.firstElementChild).toHaveClass("whitespace-pre-wrap", "break-words");
    });

    it("一覧は 200 行までで、超えた分は「ほかに K 件」を出す（200 行ちょうどなら出さない）", () => {
      const labels = Array.from({ length: 200 }, (_, index) => `項目${index}`);
      const { rerender, props } = renderDialog({ preview: preview({ absorbedLabels: labels, hiddenAbsorbedCount: 0 }) });
      expect(within(screen.getByRole("list", { name: "統合されて消えるノード" })).getAllByRole("listitem")).toHaveLength(200);
      expect(screen.queryByText(/^ほかに/)).toBeNull();

      rerender(<NodeMergeDialog {...props} preview={preview({ absorbedLabels: labels, hiddenAbsorbedCount: 50 })} />);
      expect(within(screen.getByRole("list", { name: "統合されて消えるノード" })).getAllByRole("listitem")).toHaveLength(200);
      expect(
        screen.getByText("ほかに50件（一覧は先頭の200件まで表示します。確定はすべてが対象です）"),
      ).toBeInTheDocument();
    });

    it("統合できないとき（プレビューが null）は、プレビューを一切出さない", () => {
      renderDialog({ preview: null, canSubmit: false, statusText: "2 つ以上のノードを選択してください。" });

      expect(screen.queryByRole("list")).toBeNull();
      expect(screen.queryByText("統合後のラベル")).toBeNull();
      expect(screen.queryByText("残すノード")).toBeNull();
      expect(screen.getByText("2 つ以上のノードを選択してください。")).toBeInTheDocument();
    });
  });

  describe("確定とキャンセル", () => {
    it("確定ボタン「統合する」は canSubmit が偽なら無効で、真なら押して onSubmit を呼ぶ", async () => {
      const user = userEvent.setup();
      const { props, rerender } = renderDialog({ canSubmit: false });
      expect(screen.getByRole("button", { name: "統合する" })).toBeDisabled();

      rerender(<NodeMergeDialog {...props} canSubmit />);
      await user.click(screen.getByRole("button", { name: "統合する" }));
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it("キャンセルボタンで onCancel を呼ぶ", async () => {
      const user = userEvent.setup();
      const { props } = renderDialog();

      await user.click(screen.getByRole("button", { name: "キャンセル" }));

      expect(props.onCancel).toHaveBeenCalledTimes(1);
    });

    it("確定・キャンセルのボタンはリピートの Enter・Space の既定動作を止める", () => {
      renderDialog();

      for (const name of ["統合する", "キャンセル"]) {
        const button = screen.getByRole("button", { name });
        expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
        expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
      }
    });

    it("ダブルクリックの 2 回目のクリックは握りつぶし、マウスのクリックを親へ通知する", () => {
      const { props } = renderDialog();
      const button = screen.getByRole("button", { name: "統合する" });

      fireEvent.click(button, { detail: 1 });
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
      expect(props.onMouseClick).toHaveBeenCalledTimes(1);

      fireEvent.click(button, { detail: 2 });
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it("キーボード・支援技術のクリック（detail 0）では確定でき、マウスのクリックとしては通知しない", () => {
      const { props } = renderDialog();

      fireEvent.click(screen.getByRole("button", { name: "統合する" }), { detail: 0 });

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
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Enter" });

      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it("「その他」の入力欄の Enter は、確定できるときだけ onSubmit を呼ぶ", () => {
      const { props, rerender } = renderDialog({ separatorPreset: "custom", canSubmit: false });
      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter" });
      expect(props.onSubmit).not.toHaveBeenCalled();

      rerender(<NodeMergeDialog {...props} canSubmit />);
      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter" });
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["isComposing が真", { isComposing: true }],
      ["keyCode が 229", { keyCode: 229 }],
      ["リピート", { repeat: true }],
    ])("「その他」の入力欄の Enter は %s のとき確定しない", (_name, init) => {
      const { props } = renderDialog({ separatorPreset: "custom" });

      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter", ...init });

      expect(props.onSubmit).not.toHaveBeenCalled();
    });
  });

  it("エラーを role=alert に出す（再読み上げのため次のフレームで入る）", async () => {
    renderDialog({ error: { sequence: 1, message: "統合の内容が変わりました。もう一度確認してください。" } });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("統合の内容が変わりました。もう一度確認してください。"));
  });

  it("エラーが無いときも role=alert の領域を常に描画する", () => {
    renderDialog();

    expect(screen.getByRole("alert")).toHaveTextContent("");
  });
});


test("タスクの引き継ぎとカスタム属性の破棄を確定前に表示する", () => {
  const taskText = "『リンゴ』のタスク、完了、期限 2026-11-26、担当者 担当、他の 1 件を破棄";
  const customAttributeText = "1 件を保持、同名 1 件を破棄（種別）";
  renderDialog({ preview: preview({ taskText, customAttributeText }) });
  expect(screen.getByText(taskText)).toBeInTheDocument();
  expect(screen.getByText(customAttributeText)).toBeInTheDocument();
});
