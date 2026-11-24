import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExchangeImportInputScreen } from "@/components/layout/ExchangeImportInputScreen";
import { formatExchangeDecodeError } from "@/domain/exchange/exchangeMessages";

type Props = Parameters<typeof ExchangeImportInputScreen>[0];

const OPML_DESCRIPTION =
  "OPML ファイル（.opml / .xml）からノードの階層を追加します。tags や座標などは取り込まれません。";

function createProps(overrides: Partial<Props> = {}): Props {
  return {
    headingId: "heading",
    entry: "opml",
    fileName: null,
    delimiter: ",",
    inputError: { sequence: 0, message: null },
    onFileLoad: jest.fn(),
    onLoadError: jest.fn(),
    onDelimiterChange: jest.fn(),
    onPreview: jest.fn(),
    onCancel: jest.fn(),
    fileInputRef: createRef(),
    ...overrides,
  };
}

function fileInput() {
  return screen.getByLabelText("ファイル");
}

function alertRegion() {
  return screen.getByRole("alert");
}

function advanceFrame() {
  act(() => {
    jest.advanceTimersToNextFrame();
  });
}

describe("ExchangeImportInputScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("見出しに id を付け、OPML の説明文を表示する", () => {
    render(<ExchangeImportInputScreen {...createProps()} />);

    expect(screen.getByRole("heading", { name: "OPML ファイル" })).toHaveAttribute("id", "heading");
    expect(screen.getByText(OPML_DESCRIPTION)).toBeInTheDocument();
  });

  it("エラーの欄は最初から常設され、エラーが無いときは空", () => {
    render(<ExchangeImportInputScreen {...createProps()} />);

    const region = alertRegion();
    expect(region).toHaveAttribute("aria-live", "assertive");
    expect(region).toBeEmptyDOMElement();
  });

  it("エラーがあれば次のフレームで欄に文言を入れ、ファイル入力に aria-invalid を付ける", () => {
    const message = formatExchangeDecodeError("empty");
    const props = createProps();
    const { rerender } = render(<ExchangeImportInputScreen {...props} />);
    const region = alertRegion();

    rerender(<ExchangeImportInputScreen {...props} inputError={{ sequence: 1, message }} />);

    expect(fileInput()).toHaveAttribute("aria-invalid", "true");
    expect(region).toBeEmptyDOMElement();

    advanceFrame();

    expect(region).toHaveTextContent(message);
  });

  it("ファイルの読み込みに失敗したら onLoadError を呼ぶ", async () => {
    const onLoadError = jest.fn();
    jest.spyOn(FileReader.prototype, "readAsText").mockImplementation(function (this: FileReader) {
      act(() => {
        this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
      });
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<ExchangeImportInputScreen {...createProps({ onLoadError })} />);

    const file = new File(["x"], "bad.opml", { type: "text/plain" });
    await user.upload(fileInput(), file);

    await waitFor(() =>
      expect(onLoadError).toHaveBeenCalledWith(
        formatExchangeDecodeError("読み込みに失敗しました"),
      ),
    );
  });
});