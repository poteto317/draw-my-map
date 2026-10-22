import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutlineImportDialog } from "@/components/layout/OutlineImportDialog";
import { parseOutlineText, type ParsedOutline } from "@/domain/outline/outlineParser";
import { buildOutlinePreview } from "@/domain/outline/outlinePreview";

type Props = Parameters<typeof OutlineImportDialog>[0];

function parse(text: string): ParsedOutline {
  const result = parseOutlineText(text);
  if (!result.ok) throw new Error(`parse failed: ${result.error.kind}`);
  return result.outline;
}

// 記号だけの行（2行目）を含み、警告が1件出る
const WARNING_TEXT = "- 果物\n-\n  - りんご";
const TEXT = "- 果物\n  - りんご";

function createProps(overrides: Partial<Props> = {}): Props {
  return {
    screen: "input",
    text: TEXT,
    textLength: TEXT.length,
    inputError: { sequence: 0, message: null },
    outline: null,
    preview: null,
    parentCandidate: { kind: "none" },
    target: "root",
    dialogNotices: { sequence: 0, status: null, alert: null },
    focusRequest: null,
    onFocusRequestApplied: jest.fn(),
    onTextChange: jest.fn(),
    onPreview: jest.fn(),
    onCancel: jest.fn(),
    onBack: jest.fn(),
    onTargetChange: jest.fn(),
    onSubmit: jest.fn(),
    onMouseClick: jest.fn(),
    ...overrides,
  };
}

function createPreviewProps(overrides: Partial<Props> = {}, text = WARNING_TEXT): Props {
  const outline = parse(text);
  return createProps({
    screen: "preview",
    text,
    textLength: text.length,
    outline,
    preview: buildOutlinePreview(outline),
    ...overrides,
  });
}

function textarea() {
  return screen.getByRole("textbox", { name: "テキスト" }) as HTMLTextAreaElement;
}

function previewRegion() {
  return screen.getByRole("region", { name: "変換結果のプレビュー" });
}

// 入力の画面にも入力のエラーの role="alert" があるので、ダイアログ内の通知はダイアログ直下の領域で探す
function dialogNoticeRegion(role: "status" | "alert") {
  const regions = within(screen.getByRole("dialog")).getAllByRole(role);
  return regions[regions.length - 1];
}

describe("OutlineImportDialog", () => {
  it("role=dialog と aria-modal を持ち、名前は「箇条書きから追加」", () => {
    render(<OutlineImportDialog {...createProps()} />);

    const dialog = screen.getByRole("dialog", { name: "箇条書きから追加" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("tabindex", "-1");
    expect(dialog).not.toHaveAttribute("aria-describedby");
  });

  it("入力の画面の group の名前は「箇条書きのテキスト」で、入力欄を含む", () => {
    render(<OutlineImportDialog {...createProps()} />);

    const group = screen.getByRole("group", { name: "箇条書きのテキスト" });
    expect(group).toContainElement(textarea());
    expect(group).not.toHaveAttribute("aria-describedby");
  });

  it("プレビューの画面の group の名前は「変換結果の確認」で、説明は要約と警告", () => {
    render(<OutlineImportDialog {...createPreviewProps()} />);

    const group = screen.getByRole("group", { name: "変換結果の確認" });
    expect(group).toHaveAccessibleDescription(
      "追加するノード: 2件（一番上の階層: 1件、最も深い階層: 2段目） 注意: 記号だけの行を 1 行取り込みません（2行目）。",
    );
    expect(group).toContainElement(previewRegion());
  });

  it("画面を変えると、group は新しい要素に作り直される", () => {
    const previewProps = createPreviewProps();
    const { rerender } = render(<OutlineImportDialog {...createProps()} />);
    const inputGroup = screen.getByRole("group", { name: "箇条書きのテキスト" });

    rerender(<OutlineImportDialog {...previewProps} />);

    const previewGroup = screen.getByRole("group", { name: "変換結果の確認" });
    expect(previewGroup).not.toBe(inputGroup);
    expect(inputGroup).not.toBeInTheDocument();
  });

  it("プレビューの画面で outline か preview が null なら、画面の中身を描画しない", () => {
    const outline = parse(TEXT);
    const { rerender } = render(
      <OutlineImportDialog {...createProps({ screen: "preview", outline, preview: null })} />,
    );
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "箇条書きから追加" })).toBeInTheDocument();

    rerender(
      <OutlineImportDialog
        {...createProps({ screen: "preview", outline: null, preview: buildOutlinePreview(outline) })}
      />,
    );
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("focusRequest が input なら、入力欄の末尾にカーソルを置いてフォーカスし、onFocusRequestApplied を1回呼ぶ", async () => {
    const props = createProps();
    const { rerender } = render(<OutlineImportDialog {...props} />);
    const input = textarea();
    // 既定でカーソルが末尾にあると、末尾へ置く処理を外しても通ってしまうので、先頭へ動かしておく
    input.setSelectionRange(0, 0);

    rerender(<OutlineImportDialog {...props} focusRequest="input" />);

    await waitFor(() => expect(input).toHaveFocus());
    expect(input.selectionStart).toBe(TEXT.length);
    expect(input.selectionEnd).toBe(TEXT.length);
    expect(props.onFocusRequestApplied).toHaveBeenCalledTimes(1);
  });

  it("focusRequest が preview なら、プレビューの領域にフォーカスし、onFocusRequestApplied を1回呼ぶ", async () => {
    const props = createPreviewProps({ focusRequest: "preview" });
    render(<OutlineImportDialog {...props} />);

    await waitFor(() => expect(previewRegion()).toHaveFocus());
    expect(props.onFocusRequestApplied).toHaveBeenCalledTimes(1);
  });

  it("プレビューの画面で中身が無いときは、focusRequest が preview でも onFocusRequestApplied を呼ばない", () => {
    const props = createProps({
      screen: "preview",
      outline: null,
      preview: buildOutlinePreview(parse(TEXT)),
      focusRequest: "preview",
    });
    render(<OutlineImportDialog {...props} />);

    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(props.onFocusRequestApplied).not.toHaveBeenCalled();
  });

  it("focusRequest が null ならフォーカスを動かさず、onFocusRequestApplied を呼ばない", () => {
    const props = createProps();
    render(<OutlineImportDialog {...props} />);

    expect(textarea()).not.toHaveFocus();
    expect(props.onFocusRequestApplied).not.toHaveBeenCalled();
  });

  it("focusRequest が header なら扱わず、onFocusRequestApplied を呼ばない", () => {
    const props = createProps({ focusRequest: "header" });
    render(<OutlineImportDialog {...props} />);

    expect(textarea()).not.toHaveFocus();
    expect(props.onFocusRequestApplied).not.toHaveBeenCalled();
  });

  it("入力の画面の Escape で onCancel を呼び、onBack は呼ばない", () => {
    const props = createProps();
    render(<OutlineImportDialog {...props} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onBack).not.toHaveBeenCalled();
  });

  it("プレビューの画面の Escape で onBack を呼び、onCancel は呼ばない", () => {
    const props = createPreviewProps();
    render(<OutlineImportDialog {...props} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(props.onBack).toHaveBeenCalledTimes(1);
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it.each([
    ["isComposing", { isComposing: true }],
    ["keyCode 229", { keyCode: 229 }],
    ["押し続け（repeat）", { repeat: true }],
  ])("%s の Escape では、onCancel も onBack も呼ばない", (_, init) => {
    const inputProps = createProps();
    const { unmount } = render(<OutlineImportDialog {...inputProps} />);
    fireEvent.keyDown(window, { key: "Escape", ...init });
    expect(inputProps.onCancel).not.toHaveBeenCalled();
    unmount();

    const previewProps = createPreviewProps();
    render(<OutlineImportDialog {...previewProps} />);
    fireEvent.keyDown(window, { key: "Escape", ...init });
    expect(previewProps.onBack).not.toHaveBeenCalled();
  });

  // 入力の画面のフォーカス可能な要素は DOM の順に「入力欄」「キャンセル」「プレビュー」
  it("入力の画面で、最後の「プレビュー」から Tab で入力欄へ、入力欄から Shift+Tab で「プレビュー」へ循環する", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<OutlineImportDialog {...props} />);
    const input = textarea();
    const cancel = screen.getByRole("button", { name: "キャンセル" });
    const preview = screen.getByRole("button", { name: "プレビュー" });

    act(() => {
      preview.focus();
    });
    await user.tab();
    expect(input).toHaveFocus();

    await user.tab({ shift: true });
    expect(preview).toHaveFocus();

    // 入力欄の Tab はインデントを入れず、次の「キャンセル」へ移る
    act(() => {
      input.focus();
    });
    await user.tab();
    expect(cancel).toHaveFocus();
    expect(input).toHaveValue(TEXT);
    expect(props.onTextChange).not.toHaveBeenCalled();
  });

  it("オーバーレイの pointerdown は既定の動作を止め、閉じるコールバックを呼ばない", () => {
    const props = createProps();
    render(<OutlineImportDialog {...props} />);
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement;

    const notCanceled = fireEvent.pointerDown(overlay);

    expect(notCanceled).toBe(false);
    expect(props.onCancel).not.toHaveBeenCalled();
    expect(props.onBack).not.toHaveBeenCalled();
  });

  it("オーバーレイのマウスのクリック（detail 1）で onMouseClick を呼び、detail 0 では呼ばない", () => {
    const props = createProps();
    render(<OutlineImportDialog {...props} />);
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement;

    fireEvent.click(overlay, { detail: 0 });
    expect(props.onMouseClick).not.toHaveBeenCalled();

    fireEvent.click(overlay, { detail: 1 });
    expect(props.onMouseClick).toHaveBeenCalledTimes(1);
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it("ダイアログの中のボタンのマウスのクリックでも onMouseClick を呼ぶ", () => {
    const props = createProps();
    render(<OutlineImportDialog {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }), { detail: 1 });

    expect(props.onMouseClick).toHaveBeenCalledTimes(1);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  describe("ダブルクリックの続きの click（detail > 1）（L-408）", () => {
    function childLabel() {
      return screen.getByText("選択中のノード「旅行」の子として追加");
    }

    it("プレビューの画面で、追加先のラベルへの detail 2 の click では選択を変えず、detail 1 と 0 では変える", () => {
      const props = createPreviewProps({ parentCandidate: { kind: "found", label: "旅行" } });
      render(<OutlineImportDialog {...props} />);
      const asChild = screen.getByRole("radio", { name: "選択中のノード「旅行」の子として追加" });

      const notCanceled = fireEvent.click(childLabel(), { detail: 2 });
      expect(notCanceled).toBe(false);
      expect(props.onTargetChange).not.toHaveBeenCalled();
      expect(asChild).not.toBeChecked();
      // ダブルクリックの続きでも、閉じた後のキャンバスのためにクリックの時刻は控える
      expect(props.onMouseClick).toHaveBeenCalledTimes(1);

      fireEvent.click(childLabel(), { detail: 1 });
      expect(props.onTargetChange).toHaveBeenCalledTimes(1);
      expect(props.onTargetChange).toHaveBeenLastCalledWith("child");
    });

    it("プレビューの画面で、キーボードによる click（detail 0）では追加先を変える", () => {
      const props = createPreviewProps({ parentCandidate: { kind: "found", label: "旅行" } });
      render(<OutlineImportDialog {...props} />);

      fireEvent.click(childLabel(), { detail: 0 });

      expect(props.onTargetChange).toHaveBeenCalledWith("child");
    });

    it("入力の画面の「キャンセル」への detail 2 の click では onCancel を呼ばず、detail 0 では呼ぶ", () => {
      const props = createProps();
      render(<OutlineImportDialog {...props} />);
      const cancel = screen.getByRole("button", { name: "キャンセル" });

      fireEvent.click(cancel, { detail: 2 });
      expect(props.onCancel).not.toHaveBeenCalled();

      fireEvent.click(cancel, { detail: 0 });
      expect(props.onCancel).toHaveBeenCalledTimes(1);
    });

    it("プレビューの画面の「戻る」への detail 2 の click では onBack を呼ばない", () => {
      const props = createPreviewProps();
      render(<OutlineImportDialog {...props} />);

      fireEvent.click(screen.getByRole("button", { name: "戻る" }), { detail: 2 });

      expect(props.onBack).not.toHaveBeenCalled();
    });
  });

  it("ダイアログ内の通知の status と alert は常設で、文言は次のフレームで入る", async () => {
    const props = createPreviewProps();
    const { rerender } = render(<OutlineImportDialog {...props} />);
    const status = dialogNoticeRegion("status");
    const alert = dialogNoticeRegion("alert");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(status).toBeEmptyDOMElement();
    expect(alert).toBeEmptyDOMElement();

    rerender(
      <OutlineImportDialog
        {...props}
        dialogNotices={{ sequence: 1, status: "確認しました。", alert: "追加できませんでした。" }}
      />,
    );

    await waitFor(() => expect(alert).toHaveTextContent("追加できませんでした。"));
    expect(status).toHaveTextContent("確認しました。");
    expect(dialogNoticeRegion("status")).toBe(status);
    expect(dialogNoticeRegion("alert")).toBe(alert);
  });

  it("入力の画面とプレビューの画面を切り替えても、通知の要素は同じ DOM ノードのまま", () => {
    const { rerender } = render(<OutlineImportDialog {...createProps()} />);
    const alert = dialogNoticeRegion("alert");

    rerender(<OutlineImportDialog {...createPreviewProps()} />);

    expect(dialogNoticeRegion("alert")).toBe(alert);
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
      const props = createPreviewProps();
      const { rerender } = render(<OutlineImportDialog {...props} />);
      const alert = dialogNoticeRegion("alert");
      const failure = { status: null, alert: "追加できませんでした。" };

      rerender(<OutlineImportDialog {...props} dialogNotices={{ ...failure, sequence: 1 }} />);
      expect(alert).toBeEmptyDOMElement();
      flushFrame();
      expect(alert).toHaveTextContent("追加できませんでした。");

      rerender(<OutlineImportDialog {...props} dialogNotices={{ ...failure, sequence: 2 }} />);
      expect(alert).toBeEmptyDOMElement();

      flushFrame();
      expect(alert).toHaveTextContent("追加できませんでした。");
      expect(dialogNoticeRegion("alert")).toBe(alert);
    });
  });
});
