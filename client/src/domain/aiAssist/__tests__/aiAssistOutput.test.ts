import {
  AI_STRUCTURE_LABEL_MAX_LENGTH,
  AI_SUMMARY_MAX_LENGTH,
  normalizeAiSummary,
  validateBranchSummaryOutput,
  validateChildCandidatesOutput,
  validateClassifyReorderOutput,
  validateDuplicatesOutput,
  validateImportanceOutput,
  validateMissingPerspectivesOutput,
} from "@/domain/aiAssist/aiAssistOutput";
import { createTestNode } from "@/testing/createTestNode";

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

describe("validateChildCandidatesOutput", () => {
  it("ラベルを正規化して返す", () => {
    expect(validateChildCandidatesOutput({
      candidates: [{ label: "  候補\u0007A " }, { label: "候補B" }],
    })).toEqual({ ok: true, candidates: [{ label: "候補A" }, { label: "候補B" }] });
  });

  it("1 件・80 文字ちょうどは通り、0 件と 21 件は不正", () => {
    expect(validateChildCandidatesOutput({ candidates: [{ label: "a" }] }).ok).toBe(true);
    expect(validateChildCandidatesOutput({ candidates: [{ label: "あ".repeat(AI_STRUCTURE_LABEL_MAX_LENGTH) }] }).ok).toBe(true);
    expect(validateChildCandidatesOutput({ candidates: [] })).toEqual({ ok: false });
    expect(validateChildCandidatesOutput({ candidates: Array.from({ length: 21 }, (_, i) => ({ label: `n${i}` })) })).toEqual({ ok: false });
  });

  it.each<[string, unknown]>([
    ["正規化すると空", { candidates: [{ label: " \u0000\t " }] }],
    ["81 文字", { candidates: [{ label: "あ".repeat(AI_STRUCTURE_LABEL_MAX_LENGTH + 1) }] }],
    ["余分なキー", { candidates: [{ label: "a", parent: 1 }] }],
    ["候補が配列でない", { candidates: null }],
    ["全体の余分なキー", { candidates: [{ label: "a" }], extra: 1 }],
    ["候補に null", { candidates: [null] }],
    ["ラベルが文字列でない", { candidates: [{ label: 1 }] }],
  ])("%s は不正", (_name, value) => {
    expect(validateChildCandidatesOutput(value)).toEqual({ ok: false });
  });
});

describe("validateMissingPerspectivesOutput", () => {
  it("child と sibling を返す。森の根では sibling を除く", () => {
    expect(validateMissingPerspectivesOutput({
      items: [
        { label: "子観点", placement: "child" },
        { label: "兄弟", placement: "sibling" },
      ],
    }, true)).toEqual({
      ok: true,
      items: [{ label: "子観点", placement: "child" }, { label: "兄弟", placement: "sibling" }],
    });
    expect(validateMissingPerspectivesOutput({
      items: [{ label: "兄弟のみ", placement: "sibling" }, { label: "子", placement: "child" }],
    }, false)).toEqual({ ok: true, items: [{ label: "子", placement: "child" }] });
    expect(validateMissingPerspectivesOutput({ items: [{ label: "s", placement: "sibling" }] }, false)).toEqual({ ok: false });
  });

  it.each<[string, unknown, boolean]>([
    ["placement が不正", { items: [{ label: "a", placement: "cousin" }] }, true],
    ["0 件", { items: [] }, true],
    ["21 件", { items: Array.from({ length: 21 }, () => ({ label: "a", placement: "child" })) }, true],
  ])("%s は不正", (_name, value, rootHasParent) => {
    expect(validateMissingPerspectivesOutput(value, rootHasParent)).toEqual({ ok: false });
  });
});

describe("validateClassifyReorderOutput", () => {
  const nodes = [
    createTestNode({ id: 1, label: "根" }),
    createTestNode({ id: 2, parentId: 1, label: "子A" }),
    createTestNode({ id: 3, parentId: 1, label: "子B" }),
    createTestNode({ id: 4, parentId: 2, label: "孫", locked: true }),
  ];
  const branchIds = new Set([1, 2, 3, 4]);

  it("reparent と reorder を通す。不正な move は除く", () => {
    const result = validateClassifyReorderOutput({
      moves: [
        { type: "reparent", nodeId: 3, newParentId: 2 },
        { type: "reorder", parentId: 1, childIds: [3, 2] },
        { type: "reparent", nodeId: 4, newParentId: 1 },
        { type: "reparent", nodeId: 2, newParentId: 4 },
        { type: "reorder", parentId: 1, childIds: [2, 3, 9] },
      ],
    }, branchIds, nodes);
    expect(result).toEqual({
      ok: true,
      moves: [
        { type: "reparent", nodeId: 3, newParentId: 2 },
        { type: "reorder", parentId: 1, childIds: [3, 2] },
      ],
    });
  });

  it("残り 0 件なら不正", () => {
    expect(validateClassifyReorderOutput({ moves: [{ type: "reparent", nodeId: 4, newParentId: 1 }] }, branchIds, nodes))
      .toEqual({ ok: false });
  });

  it("31 件は不正", () => {
    const moves = Array.from({ length: 31 }, () => ({ type: "reparent" as const, nodeId: 3, newParentId: 2 }));
    expect(validateClassifyReorderOutput({ moves }, branchIds, nodes)).toEqual({ ok: false });
  });

  it("構文不正な move は除き、有効なものだけ返す", () => {
    expect(validateClassifyReorderOutput({
      moves: [
        { type: "reparent", nodeId: 3, newParentId: 2 },
        { type: "unknown", nodeId: 1 },
        { type: "reorder", parentId: 1, childIds: [3, 2] },
      ],
    }, branchIds, nodes)).toEqual({
      ok: true,
      moves: [
        { type: "reparent", nodeId: 3, newParentId: 2 },
        { type: "reorder", parentId: 1, childIds: [3, 2] },
      ],
    });
  });

  it("構文不正だけが残るなら不正", () => {
    expect(validateClassifyReorderOutput({
      moves: [{ type: "bogus" }, null],
    }, branchIds, nodes)).toEqual({ ok: false });
  });
});

describe("validateDuplicatesOutput", () => {
  const nodes = [
    createTestNode({ id: 1, label: "根" }),
    createTestNode({ id: 2, parentId: 1, label: "A" }),
    createTestNode({ id: 3, parentId: 1, label: "B" }),
    createTestNode({ id: 4, parentId: 1, label: "ロック", locked: true }),
  ];
  const branchIds = new Set([1, 2, 3, 4]);
  const visible = new Set([1, 2, 3, 4]);
  const mergeCtx = { nodes, visibleNodeIds: visible, currentMapId: "map-a" };

  it("統合可能な組だけ残し、理由を表示用に切る", () => {
    const result = validateDuplicatesOutput({
      pairs: [
        { primaryId: 2, secondaryId: 3, reason: " 似ている\n\t" },
        { primaryId: 3, secondaryId: 2, reason: "あ".repeat(31) },
        { primaryId: 2, secondaryId: 2, reason: "同一" },
        { primaryId: 4, secondaryId: 2, reason: "ロック" },
        { primaryId: 2, secondaryId: 9, reason: "範囲外" },
      ],
    }, branchIds, mergeCtx);
    expect(result).toEqual({
      ok: true,
      pairs: [
        { primaryId: 2, secondaryId: 3, reason: "似ている" },
        { primaryId: 3, secondaryId: 2, reason: `${"あ".repeat(29)}…` },
      ],
    });
  });

  it("1 組も残らないなら不正", () => {
    expect(validateDuplicatesOutput({ pairs: [{ primaryId: 4, secondaryId: 2, reason: "" }] }, branchIds, mergeCtx))
      .toEqual({ ok: false });
  });

  it("reason が正規化不能な pair は除き、残りがあれば ok", () => {
    expect(validateDuplicatesOutput({
      pairs: [
        { primaryId: 2, secondaryId: 3, reason: "有効" },
        { primaryId: 2, secondaryId: 3, reason: 99 },
      ],
    }, branchIds, mergeCtx)).toEqual({
      ok: true,
      pairs: [{ primaryId: 2, secondaryId: 3, reason: "有効" }],
    });
  });
});
