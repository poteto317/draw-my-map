import {
  EXCHANGE_MAX_ITEMS,
  EXCHANGE_MAX_TEXT_LENGTH,
} from "@/domain/exchange/exchangeLimits";
import { parseExchangeContent } from "@/domain/exchange/parseExchangeContent";

const CSV_HEADER = "id,parentId,label,importance,note,tags";

describe("parseExchangeContent の上限", () => {
  it("文字数が上限を超えると too-long で拒否し decode しない", () => {
    const text = "a".repeat(EXCHANGE_MAX_TEXT_LENGTH + 1);
    const result = parseExchangeContent(text, "csv-tsv", ",");
    expect(result).toEqual({ ok: false, reason: "too-long" });
  });

  it("OPML でも文字数上限を先に判定する", () => {
    const text = `<opml><body>${"x".repeat(EXCHANGE_MAX_TEXT_LENGTH + 1)}</body></opml>`;
    expect(parseExchangeContent(text, "opml", ",")).toEqual({ ok: false, reason: "too-long" });
  });

  it("ノード件数が上限を超えると too-many-items で拒否する", () => {
    const rows = [`${CSV_HEADER}`];
    for (let i = 0; i < EXCHANGE_MAX_ITEMS + 1; i += 1) {
      rows.push(`${i},,N${i},medium,,`);
    }
    const result = parseExchangeContent(rows.join("\n"), "csv-tsv", ",");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/^too-many-items:/);
  });
});