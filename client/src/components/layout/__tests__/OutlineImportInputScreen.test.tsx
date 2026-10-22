import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { OutlineImportInputScreen } from "@/components/layout/OutlineImportInputScreen";

type Props = Parameters<typeof OutlineImportInputScreen>[0];

const DESCRIPTION =
  "1行を1つのノードにします。行頭の空白（タブ・半角スペース・全角スペース）の深さで親子を決めます。行頭の「- * + ・ •」と「1.」「1)」は取り除きます。空行は無視します。";
const NO_ITEMS_MESSAGE = "取り込める行がありません。…";
const TOO_LONG_MESSAGE = "テキストが長すぎます（1,000,000文字以内）。";

function createProps(overrides: Partial<Props> = {}): Props {
  return {
    headingId: "heading",
    text: "",
    textLength: 0,
    inputError: { sequence: 0, message: null },
    onTextChange: jest.fn(),
    onPreview: jest.fn(),
    onCancel: jest.fn(),
    textareaRef: createRef<HTMLTextAreaElement>(),
    ...overrides,
  };
}

function textarea() {
  return screen.getByLabelText("テキスト");
}

function alertRegion() {
  return screen.getByRole("alert");
}

function previewButton() {
  return screen.getByRole("button", { name: "プレビュー" });
}

function describedByIds(element: HTMLElement): string[] {
  return (element.getAttribute("aria-describedby") ?? "").split(" ").filter((id) => id !== "");
}

function descriptionElement() {
  return screen.getByText(DESCRIPTION);
}

function advanceFrame() {
  act(() => {
    jest.advanceTimersToNextFrame();
  });
}

describe("OutlineImportInputScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("見出しに id を付け、説明文を設計書の文言で表示する", () => {
    render(<OutlineImportInputScreen {...createProps()} />);

    expect(screen.getByRole("heading", { name: "箇条書きのテキスト" })).toHaveAttribute(
      "id",
      "heading",
    );
    expect(descriptionElement()).toHaveAttribute("id");
  });

  it("ラベル「テキスト」で入力欄が取れ、maxLength を付けず、説明文だけを aria-describedby に入れる", () => {
    render(<OutlineImportInputScreen {...createProps({ text: "- 果物" })} />);

    const input = textarea();
    expect(input.tagName).toBe("TEXTAREA");
    expect(input).toHaveValue("- 果物");
    expect(input).not.toHaveAttribute("maxLength");
    expect(input).toHaveAttribute("rows", "12");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(describedByIds(input)).toEqual([descriptionElement().id]);
  });

  it("textareaRef に入力欄を渡す", () => {
    const textareaRef = createRef<HTMLTextAreaElement>();
    render(<OutlineImportInputScreen {...createProps({ textareaRef })} />);

    expect(textareaRef.current).toBe(textarea());
  });

  it("エラーの欄は最初から常設され、エラーが無いときは空", () => {
    render(<OutlineImportInputScreen {...createProps()} />);

    const region = alertRegion();
    expect(region).toHaveAttribute("aria-live", "assertive");
    expect(region).toHaveAttribute("id");
    expect(region).toBeEmptyDOMElement();
  });

  it("エラーがあれば次のフレームで欄に文言を入れ、aria-invalid と aria-describedby を付ける", () => {
    const props = createProps();
    const { rerender } = render(<OutlineImportInputScreen {...props} />);
    const region = alertRegion();

    rerender(
      <OutlineImportInputScreen
        {...props}
        inputError={{ sequence: 1, message: NO_ITEMS_MESSAGE }}
      />,
    );

    expect(textarea()).toHaveAttribute("aria-invalid", "true");
    expect(describedByIds(textarea())).toEqual([descriptionElement().id, region.id]);
    expect(region).toBeEmptyDOMElement();

    advanceFrame();

    expect(alertRegion()).toBe(region);
    expect(region).toHaveTextContent(NO_ITEMS_MESSAGE);
  });

  it("同じ文言でも sequence が進めば、同じ欄を一度空にして次のフレームで入れ直す", () => {
    const props = createProps({ inputError: { sequence: 1, message: NO_ITEMS_MESSAGE } });
    const { rerender } = render(<OutlineImportInputScreen {...props} />);
    advanceFrame();
    const region = alertRegion();
    expect(region).toHaveTextContent(NO_ITEMS_MESSAGE);

    rerender(
      <OutlineImportInputScreen
        {...props}
        inputError={{ sequence: 2, message: NO_ITEMS_MESSAGE }}
      />,
    );

    expect(alertRegion()).toBe(region);
    expect(region).toBeEmptyDOMElement();

    advanceFrame();

    expect(alertRegion()).toBe(region);
    expect(region).toHaveTextContent(NO_ITEMS_MESSAGE);
  });

  it("エラーが消えると欄を空にし、aria-invalid を外して説明文だけを指す", () => {
    const props = createProps({ inputError: { sequence: 1, message: NO_ITEMS_MESSAGE } });
    const { rerender } = render(<OutlineImportInputScreen {...props} />);
    advanceFrame();

    rerender(
      <OutlineImportInputScreen {...props} inputError={{ sequence: 2, message: null }} />,
    );
    advanceFrame();

    expect(alertRegion()).toBeEmptyDOMElement();
    expect(textarea()).not.toHaveAttribute("aria-invalid");
    expect(describedByIds(textarea())).toEqual([descriptionElement().id]);
  });

  // ダイアログを開き直すと入力の画面は作り直されるが、前回の inputError は残る。
  // 常設の欄が空のまま描画され、次のフレームで文言が入るので、開き直したときにも読み上げ直す
  it("エラーが残ったまま作り直されると、空の欄を描画してから次のフレームで文言を入れる", () => {
    render(
      <OutlineImportInputScreen
        {...createProps({ inputError: { sequence: 3, message: NO_ITEMS_MESSAGE } })}
      />,
    );
    const region = alertRegion();

    expect(region).toBeEmptyDOMElement();
    expect(textarea()).toHaveAttribute("aria-invalid", "true");

    advanceFrame();

    expect(alertRegion()).toBe(region);
    expect(region).toHaveTextContent(NO_ITEMS_MESSAGE);
  });

  it("上限を超えたまま textLength だけ変わっても欄の文言を入れ直さず、現在の文字数は alert の外で更新する", () => {
    const request = jest.spyOn(window, "requestAnimationFrame");
    const inputError = { sequence: 1, message: TOO_LONG_MESSAGE };
    const props = createProps({ textLength: 1_000_001, inputError });
    const { rerender } = render(<OutlineImportInputScreen {...props} />);
    advanceFrame();
    const region = alertRegion();
    const callsBefore = request.mock.calls.length;

    expect(screen.getByText("現在 1,000,001 文字")).toBeInTheDocument();

    rerender(<OutlineImportInputScreen {...props} textLength={1_000_002} />);

    expect(request).toHaveBeenCalledTimes(callsBefore);
    expect(region).toHaveTextContent(TOO_LONG_MESSAGE);
    expect(screen.queryByText("現在 1,000,001 文字")).not.toBeInTheDocument();
    const currentLength = screen.getByText("現在 1,000,002 文字");
    expect(region).not.toContainElement(currentLength);
    expect(currentLength.closest("[aria-live]")).toBeNull();
  });

  it("現在の文字数は上限を超えている間だけ表示する", () => {
    const { rerender } = render(
      <OutlineImportInputScreen {...createProps({ textLength: 1_000_000 })} />,
    );

    expect(screen.queryByText(/^現在 .* 文字$/)).not.toBeInTheDocument();

    rerender(<OutlineImportInputScreen {...createProps({ textLength: 1_000_001 })} />);

    expect(screen.getByText("現在 1,000,001 文字")).toBeInTheDocument();
  });

  it("入力の値を onTextChange に渡す", () => {
    const onTextChange = jest.fn();
    render(<OutlineImportInputScreen {...createProps({ onTextChange })} />);

    fireEvent.change(textarea(), { target: { value: "- 果物\n  - りんご" } });

    expect(onTextChange).toHaveBeenCalledTimes(1);
    expect(onTextChange).toHaveBeenCalledWith("- 果物\n  - りんご");
  });

  it("IME の変換中の Enter は、押し続けでも止めない", () => {
    render(<OutlineImportInputScreen {...createProps()} />);

    expect(
      fireEvent.keyDown(textarea(), { key: "Enter", isComposing: true, repeat: true }),
    ).toBe(true);
    expect(fireEvent.keyDown(textarea(), { key: "Enter", keyCode: 229, repeat: true })).toBe(
      true,
    );
  });

  it("入力欄の押し続けの Enter は止め、普通の Enter は改行のために止めない", () => {
    const onPreview = jest.fn();
    render(<OutlineImportInputScreen {...createProps({ onPreview })} />);

    expect(fireEvent.keyDown(textarea(), { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(textarea(), { key: "Enter", repeat: false })).toBe(true);
    expect(fireEvent.keyDown(textarea(), { key: "a", repeat: true })).toBe(true);
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("入力欄からの blur では何も確定しない", () => {
    const onPreview = jest.fn();
    const onCancel = jest.fn();
    render(<OutlineImportInputScreen {...createProps({ onPreview, onCancel })} />);

    fireEvent.blur(textarea());

    expect(onPreview).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("「プレビュー」の押し続けの Enter・Space は止め、押し続けでなければ止めない", () => {
    render(<OutlineImportInputScreen {...createProps()} />);

    expect(fireEvent.keyDown(previewButton(), { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(previewButton(), { key: " ", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(previewButton(), { key: "Enter", repeat: false })).toBe(true);
    expect(fireEvent.keyDown(previewButton(), { key: " ", repeat: false })).toBe(true);
  });

  it("「プレビュー」のクリックで onPreview、「キャンセル」で onCancel を呼ぶ。エラーがあってもどちらも無効にしない", () => {
    const onPreview = jest.fn();
    const onCancel = jest.fn();
    render(
      <OutlineImportInputScreen
        {...createProps({
          onPreview,
          onCancel,
          inputError: { sequence: 1, message: NO_ITEMS_MESSAGE },
        })}
      />,
    );
    const cancelButton = screen.getByRole("button", { name: "キャンセル" });

    expect(previewButton()).toBeEnabled();
    expect(cancelButton).toBeEnabled();

    fireEvent.click(previewButton());
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
