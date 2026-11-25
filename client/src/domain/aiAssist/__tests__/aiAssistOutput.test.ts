import {
  AI_SUMMARY_MAX_LENGTH,
  normalizeAiSummary,
  validateBranchSummaryOutput,
  validateImportanceOutput,
} from "@/domain/aiAssist/aiAssistOutput";

describe("normalizeAiSummary", () => {
  it("改行以外の制御文字を除き、3 行以上の連続改行を 2 行にまとめ、前後の空白を除く", () => {
    expect(normalizeAiSummary("  要約\u0007の\r\n本文\n\n\n\n次\t \u0085 ")).toBe("要約の\n本文\n\n次");
  });
});

describe("validateBranchSummaryOutput", () => {
  it("正規化した要約を返す", () => {
    expect(validateBranchSummaryOutput({ summary: " 要約です。\n\n\n\n- 項目 " })).toEqual({ ok: true, summary: "要約です。\n\n- 項目" });
  });

  it("正規化の後に 400 文字ちょうどは通り、401 文字は不正（L-633）", () => {
    expect(validateBranchSummaryOutput({ summary: "あ".repeat(AI_SUMMARY_MAX_LENGTH) }).ok).toBe(true);
    expect(validateBranchSummaryOutput({ summary: `  ${"あ".repeat(AI_SUMMARY_MAX_LENGTH)}  ` }).ok).toBe(true);
    expect(validateBranchSummaryOutput({ summary: "あ".repeat(AI_SUMMARY_MAX_LENGTH + 1) })).toEqual({ ok: false });
  });

  it.each<[string, unknown]>([
    ["正規化すると空", { summary: " \u0000\n\t " }],
    ["文字列でない", { summary: 1 }],
    ["余分な項目", { summary: "a", note: "b" }],
    ["項目が無い", {}],
    ["配列", ["a"]],
    ["null", null],
  ])("%s は不正", (_name, value) => {
    expect(validateBranchSummaryOutput(value)).toEqual({ ok: false });
  });
});

describe("validateImportanceOutput", () => {
  const targets = [1, 2, 3];

  it("対象の ID の提案を受け取り順に返す。理由は制御文字と前後の空白を除き、30 文字を超えたら「…」付きで切る", () => {
    const result = validateImportanceOutput({
      suggestions: [
        { id: 2, importance: "high", reason: " 主要な\n論点 " },
        { id: 1, importance: "low", reason: "あ".repeat(31) },
        { id: 3, importance: "medium", reason: "" },
      ],
    }, targets);

    expect(result).toEqual({
      ok: true,
      suggestions: [
        { id: 2, importance: "high", reason: "主要な論点" },
        { id: 1, importance: "low", reason: `${"あ".repeat(29)}…` },
        { id: 3, importance: "medium", reason: "" },
      ],
    });
  });

  it("理由がちょうど 30 文字なら切らない", () => {
    const reason = "あ".repeat(30);
    expect(validateImportanceOutput({ suggestions: [{ id: 1, importance: "low", reason }] }, targets))
      .toEqual({ ok: true, suggestions: [{ id: 1, importance: "low", reason }] });
  });

  it("理由が制御文字だけなら空文字になる", () => {
    expect(validateImportanceOutput({ suggestions: [{ id: 1, importance: "low", reason: "\u0000" }] }, targets))
      .toEqual({ ok: true, suggestions: [{ id: 1, importance: "low", reason: "" }] });
  });

  it("対象が空配列で提案があるなら不正", () => {
    expect(validateImportanceOutput({ suggestions: [{ id: 1, importance: "low", reason: "" }] }, [])).toEqual({ ok: false });
  });

  it("提案の無い対象があっても不正にしない", () => {
    expect(validateImportanceOutput({ suggestions: [] }, targets)).toEqual({ ok: true, suggestions: [] });
  });

  it.each<[string, unknown]>([
    ["範囲外の重要度", { suggestions: [{ id: 1, importance: "urgent", reason: "" }] }],
    ["重複 ID", { suggestions: [{ id: 1, importance: "low", reason: "" }, { id: 1, importance: "high", reason: "" }] }],
    ["対象外の ID", { suggestions: [{ id: 9, importance: "low", reason: "" }] }],
    ["整数でない ID", { suggestions: [{ id: 1.5, importance: "low", reason: "" }] }],
    ["項目の余分なキー", { suggestions: [{ id: 1, importance: "low", reason: "", extra: true }] }],
    ["理由が無い", { suggestions: [{ id: 1, importance: "low" }] }],
    ["全体の余分なキー", { suggestions: [], summary: "" }],
    ["配列でない", { suggestions: {} }],
    ["理由が文字列でない", { suggestions: [{ id: 1, importance: "low", reason: 1 }] }],
    ["ID が無い", { suggestions: [{ importance: "low", reason: "" }] }],
    ["重要度が無い", { suggestions: [{ id: 1, reason: "" }] }],
    ["提案に null が混ざる", { suggestions: [{ id: 1, importance: "low", reason: "" }, null] }],
  ])("%s は全体を不正にする（部分的に採らない）", (_name, value) => {
    expect(validateImportanceOutput(value, targets)).toEqual({ ok: false });
  });
});
