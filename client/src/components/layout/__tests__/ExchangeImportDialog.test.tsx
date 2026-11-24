import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExchangeImportDialog } from "@/components/layout/ExchangeImportDialog";
import { buildExchangePreview } from "@/domain/exchange/exchangePreview";
import type { ParsedExchange } from "@/domain/exchange/parseExchangeContent";

type Props = Parameters<typeof ExchangeImportDialog>[0];

const parsed: ParsedExchange = {
  items: [
    { label: "親", parentIndex: null },
    { label: "子", parentIndex: 0 },
  ],
  warnings: [],
  showOpmlLossyNotice: true,
};

function createProps(overrides: Partial<Props> = {}): Props {
  return {
    screen: "input",
    entry: "opml",
    fileName: null,
    delimiter: ",",
    inputError: { sequence: 0, message: null },
    parsed: null,
    preview: null,
    parentCandidate: { kind: "none" },
    target: "root",
    dialogNotices: { sequence: 0, status: null, alert: null },
    focusRequest: null,
    onFocusRequestApplied: jest.fn(),
    onFileLoad: jest.fn(),
    onLoadError: jest.fn(),
    onDelimiterChange: jest.fn(),
    onPreview: jest.fn(),
    onCancel: jest.fn(),
    onBack: jest.fn(),
    onTargetChange: jest.fn(),
    onSubmit: jest.fn(),
    onMouseClick: jest.fn(),
    ...overrides,
  };
}

function createPreviewProps(overrides: Partial<Props> = {}): Props {
  const preview = buildExchangePreview(parsed.items);
  return createProps({
    screen: "preview",
    parsed: { ...parsed },
    preview,
    ...overrides,
  });
}

function fileInput() {
  return screen.getByLabelText("ファイル");
}

function previewRegion() {
  return screen.getByRole("region", { name: "変換結果のプレビュー" });
}

function dialogNoticeRegion(role: "status" | "alert") {
  const regions = screen.getAllByRole(role);
  return regions[regions.length - 1]!;
}

describe("ExchangeImportDialog", () => {
  it("role=dialog と aria-modal を持ち、OPML の名前は「OPML取り込み」", () => {
    render(<ExchangeImportDialog {...createProps()} />);

    const dialog = screen.getByRole("dialog", { name: "OPML取り込み" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("tabindex", "-1");
    expect(dialog).not.toHaveAttribute("aria-describedby");
  });

  it("focusRequest が input なら、ファイル入力にフォーカスし onFocusRequestApplied を1回呼ぶ", async () => {
    const props = createProps();
    const { rerender } = render(<ExchangeImportDialog {...props} />);

    rerender(<ExchangeImportDialog {...props} focusRequest="input" />);

    await waitFor(() => expect(fileInput()).toHaveFocus());
    expect(props.onFocusRequestApplied).toHaveBeenCalledTimes(1);
  });

  it("focusRequest が preview なら、プレビュー領域にフォーカスする", async () => {
    const props = createPreviewProps({ focusRequest: "preview" });
    render(<ExchangeImportDialog {...props} />);

    await waitFor(() => expect(previewRegion()).toHaveFocus());
    expect(props.onFocusRequestApplied).toHaveBeenCalledTimes(1);
  });

  it("入力の画面の Escape で onCancel を呼び、onBack は呼ばない", () => {
    const props = createProps();
    render(<ExchangeImportDialog {...props} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onBack).not.toHaveBeenCalled();
  });

  it("プレビューの画面の Escape で onBack を呼び、onCancel は呼ばない", () => {
    const props = createPreviewProps();
    render(<ExchangeImportDialog {...props} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(props.onBack).toHaveBeenCalledTimes(1);
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it("dialogNotices の alert は aria-live=assertive で次のフレームに文言を入れる", async () => {
    const props = createPreviewProps({
      dialogNotices: { sequence: 1, status: null, alert: "ノードを追加できませんでした。" },
    });
    render(<ExchangeImportDialog {...props} />);

    const alert = dialogNoticeRegion("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");

    await waitFor(() => expect(alert).toHaveTextContent("ノードを追加できませんでした。"));
  });
});