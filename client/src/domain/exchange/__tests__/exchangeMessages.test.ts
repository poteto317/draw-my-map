import {
  EXCHANGE_OPML_LOSSY_NOTICE,
  formatExchangeDecodeError,
  formatExchangeImportSuccess,
  formatExchangePreviewSummary,
} from "@/domain/exchange/exchangeMessages";
import type { ForestItem } from "@/domain/nodes/nodeForestInsertion";

describe("formatExchangeDecodeError", () => {
  it("empty を日本語で返す", () => {
    expect(formatExchangeDecodeError("empty")).toBe(
      "取り込める内容がありません。ファイルを選び直してください。",
    );
  });

  it("OPML の invalid-xml を返す", () => {
    expect(formatExchangeDecodeError("invalid-xml")).toBe(
      "OPML として読み取れません。XML の形式を確認してください。",
    );
  });

  it("unclosed-quote を案内する", () => {
    expect(formatExchangeDecodeError("unclosed-quote")).toBe(
      "CSV/TSV の引用符（\"）が閉じられていません。ファイルを確認してください。",
    );
  });

  it("too-many-items を案内する", () => {
    expect(formatExchangeDecodeError("too-many-items:10001")).toContain("10,000");
    expect(formatExchangeDecodeError("too-many-items:10001")).toContain("10,001");
  });

  it("file-too-large を案内する", () => {
    expect(formatExchangeDecodeError("file-too-large")).toContain("1,000,000");
  });

  it("不明な理由はそのまま載せる", () => {
    expect(formatExchangeDecodeError('行3: id "x" が重複')).toContain("重複");
  });
});

describe("formatExchangePreviewSummary", () => {
  const items: ForestItem[] = [
    { label: "A", parentIndex: null },
    { label: "B", parentIndex: 0 },
    { label: "C", parentIndex: null },
  ];

  it("件数と階層を箇条書き取込と同型で示す", () => {
    expect(formatExchangePreviewSummary(items)).toBe(
      "追加するノード: 3件（一番上の階層: 2件、最も深い階層: 2段目）",
    );
  });
});

describe("formatExchangeImportSuccess", () => {
  it("件数を含む成功文言を返す", () => {
    expect(formatExchangeImportSuccess(2)).toContain("2件のノードを追加しました");
  });
});

describe("EXCHANGE_OPML_LOSSY_NOTICE", () => {
  it("tags 等が落ちる旨を含む", () => {
    expect(EXCHANGE_OPML_LOSSY_NOTICE).toMatch(/tags/);
    expect(EXCHANGE_OPML_LOSSY_NOTICE).toMatch(/label/);
  });
});