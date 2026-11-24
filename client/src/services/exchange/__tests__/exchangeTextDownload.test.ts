import { downloadExchangeText } from "@/services/exchange/exchangeTextDownload";

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

describe("downloadExchangeText", () => {
  afterEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
    jest.restoreAllMocks();
  });

  it("OPML・CSV・TSV の拡張子付きファイル名でダウンロードする", () => {
    const createObjectURL = jest.fn(() => "blob:exchange");
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const now = new Date(2026, 10, 24, 12, 0, 0);

    downloadExchangeText("<opml/>", "旅行", "opml", now);
    expect((click.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe("旅行-20261124-120000.opml");

    downloadExchangeText("a,b", "旅行", "csv", now);
    expect((click.mock.instances[1] as unknown as HTMLAnchorElement).download).toBe("旅行-20261124-120000.csv");

    downloadExchangeText("a\tb", "旅行", "tsv", now);
    expect((click.mock.instances[2] as unknown as HTMLAnchorElement).download).toBe("旅行-20261124-120000.tsv");
    expect(revokeObjectURL).toHaveBeenCalled();
  });
});