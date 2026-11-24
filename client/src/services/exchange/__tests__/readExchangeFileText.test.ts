import {
  EXCHANGE_MAX_FILE_BYTES,
  EXCHANGE_MAX_TEXT_LENGTH,
} from "@/domain/exchange/exchangeLimits";
import {
  ExchangeFileReadError,
  readExchangeFileText,
} from "@/services/exchange/readExchangeFileText";

describe("readExchangeFileText", () => {
  it("FileReader の結果を文字列で返す", async () => {
  const file = new File(["hello"], "a.opml", { type: "text/plain" });
    await expect(readExchangeFileText(file)).resolves.toBe("hello");
  });

  it("File.size が文字数上限のちょうど 3 倍までは読み込みを試みる", async () => {
    const file = new File(["a"], "edge.opml");
    Object.defineProperty(file, "size", {
      configurable: true,
      value: EXCHANGE_MAX_TEXT_LENGTH * 3,
    });
    await expect(readExchangeFileText(file)).resolves.toBe("a");
  });

  it("File.size が上限超過なら readAsText を呼ばず file-too-large で拒否する", async () => {
    const file = new File(["x"], "big.opml");
    Object.defineProperty(file, "size", { configurable: true, value: EXCHANGE_MAX_FILE_BYTES + 1 });
    const readAsText = jest.spyOn(FileReader.prototype, "readAsText");
    await expect(readExchangeFileText(file)).rejects.toEqual(
      expect.objectContaining({ reason: "file-too-large" }),
    );
    expect(readAsText).not.toHaveBeenCalled();
  });

  it("ExchangeFileReadError は reason を持つ", () => {
    expect(new ExchangeFileReadError("file-too-large").reason).toBe("file-too-large");
  });

  it("読み込み失敗時は reject する", async () => {
    jest.spyOn(FileReader.prototype, "readAsText").mockImplementation(function (this: FileReader) {
      this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
    });
    const file = new File(["x"], "bad.opml", { type: "text/plain" });
    await expect(readExchangeFileText(file)).rejects.toEqual(
      expect.objectContaining({ reason: "read-failed" }),
    );
  });
});